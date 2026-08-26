<?php

declare(strict_types=1);

namespace Tests\Feature\System;

use App\Domains\System\Services\SystemHealthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Health probes that can actually catch an outage.
 *
 * Written after a real one: Redis died at 03:51 and was still dead nineteen
 * hours later, while `/api/health` answered `{"status":"ok"}` throughout. It
 * was reporting that the app had booted — true, and useless. The queue was
 * doing nothing the entire time, so order confirmations, staff alerts, live
 * board updates and outgoing webhooks silently stopped, and nobody knew until
 * someone went looking in the logs for something else.
 *
 * The split matters. `/api/health` must keep returning 200 while the app can
 * serve a request, because sessions live in the database and the site works
 * with Redis down — answering 503 there would pull a working site out of
 * rotation and make a partial failure total. `/api/health/ready` is the one
 * that goes red, and the one to point monitoring at.
 */
class HealthReadinessTest extends TestCase
{
    use RefreshDatabase;

    /** @param list<string> $degraded */
    private function fakeDependencies(array $degraded): void
    {
        $stub = new class($degraded) extends SystemHealthService
        {
            /** @param list<string> $degraded */
            public function __construct(private array $degraded) {}

            public function degradedDependencies(): array
            {
                return $this->degraded;
            }
        };

        $this->app->instance(SystemHealthService::class, $stub);
    }

    public function test_readiness_goes_red_when_redis_is_down(): void
    {
        // THE test. This is the signal that was missing for nineteen hours.
        $this->fakeDependencies(['redis', 'queue']);

        $this->getJson('/api/health/ready')
            ->assertStatus(503)
            ->assertJsonPath('status', 'degraded')
            ->assertJsonPath('degraded', ['redis', 'queue']);
    }

    public function test_readiness_is_green_when_everything_works(): void
    {
        $this->fakeDependencies([]);

        $this->getJson('/api/health/ready')
            ->assertOk()
            ->assertJsonPath('status', 'ready')
            ->assertJsonPath('degraded', []);
    }

    public function test_liveness_stays_200_even_when_a_dependency_is_down(): void
    {
        // Deliberate. The site serves fine with Redis down (sessions are in
        // the database), so failing this probe would take a working site out
        // of rotation and turn a degraded queue into a full outage.
        $this->fakeDependencies(['redis']);

        $this->getJson('/api/health')
            ->assertOk()
            ->assertJsonPath('status', 'degraded')
            ->assertJsonPath('degraded', ['redis']);
    }

    public function test_liveness_says_plain_ok_when_healthy(): void
    {
        // The shape the existing uptime monitor already reads — a healthy
        // response must not suddenly grow a `degraded` key.
        $this->fakeDependencies([]);

        $response = $this->getJson('/api/health')->assertOk();

        $response->assertJsonPath('status', 'ok');
        $this->assertArrayNotHasKey('degraded', $response->json());
    }

    public function test_the_probes_never_leak_why(): void
    {
        // Both endpoints are unauthenticated, and the underlying checks return
        // exception text carrying socket paths and connection strings. Names
        // of unhappy dependencies only; detail stays on the admin probe.
        $this->fakeDependencies(['redis']);

        foreach (['/api/health', '/api/health/ready'] as $url) {
            $body = json_encode($this->getJson($url)->json());

            $this->assertStringNotContainsString('/home/', $body, "{$url} leaked a path");
            $this->assertStringNotContainsString('.sock', $body, "{$url} leaked a socket");
            $this->assertStringNotContainsString('Connection refused', $body);
        }
    }

    public function test_the_real_service_reports_a_healthy_stack_as_healthy(): void
    {
        // No stub — the actual checks against the test environment. Guards
        // against a probe that cries wolf, which gets muted and then misses
        // the outage it was added for.
        $degraded = app(SystemHealthService::class)->degradedDependencies();

        $this->assertNotContains('database', $degraded, 'database should be reachable in tests');
    }
}
