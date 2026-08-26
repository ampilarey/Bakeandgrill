<?php

declare(strict_types=1);

namespace Tests\Feature\System;

use App\Domains\System\Services\SystemHealthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * The dead-man's switch has to watch the system, not just its own pulse.
 *
 * On 2026-08-26 Redis died at 03:51 and was still dead nineteen hours later.
 * The scheduler was healthy throughout, so `scheduler:heartbeat` pinged
 * healthchecks.io every minute and the monitor stayed green — while the queue
 * did nothing, and order confirmations, staff alerts, live board updates and
 * outgoing webhooks silently stopped. The alarm was wired to the wrong signal.
 *
 * Now a degraded dependency sends `<url>/fail`, which healthchecks.io alerts
 * on immediately instead of waiting for silence that will never come.
 */
class HeartbeatReportsDegradedTest extends TestCase
{
    use RefreshDatabase;

    private const URL = 'https://hc-ping.test/heartbeat-token';

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

    protected function setUp(): void
    {
        parent::setUp();
        config(['system.healthcheck_url' => self::URL]);
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response('OK', 200)]);
    }

    public function test_a_dead_redis_sends_a_failure_ping(): void
    {
        // THE test. This is the alert that did not fire for nineteen hours.
        $this->fakeDependencies(['redis', 'queue']);

        $this->artisan('scheduler:heartbeat')->assertFailed();

        Http::assertSent(fn ($request) => $request->url() === self::URL . '/fail');
    }

    public function test_the_failure_ping_says_what_is_wrong(): void
    {
        // The email should name the dependency, so whoever reads it at 3am
        // knows whether to restart Redis or look at the database.
        $this->fakeDependencies(['redis']);

        $this->artisan('scheduler:heartbeat')->assertFailed();

        Http::assertSent(fn ($request) => str_contains((string) $request->body(), 'redis'));
    }

    public function test_a_healthy_system_pings_normally(): void
    {
        // The ordinary minute. If this regresses into a failure ping, the
        // monitor cries wolf and gets muted — which is worse than before.
        $this->fakeDependencies([]);

        $this->artisan('scheduler:heartbeat')->assertSuccessful();

        Http::assertSent(fn ($request) => $request->url() === self::URL);
        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/fail'));
    }

    public function test_a_broken_health_check_still_raises_the_alarm(): void
    {
        // If the dependency check itself explodes, that is not a reason to
        // report everything is fine — silence is the failure mode this whole
        // change exists to remove.
        $stub = new class extends SystemHealthService
        {
            public function __construct() {}

            public function degradedDependencies(): array
            {
                throw new \RuntimeException('check exploded');
            }
        };
        $this->app->instance(SystemHealthService::class, $stub);

        $this->artisan('scheduler:heartbeat')->assertFailed();

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/fail'));
    }

    public function test_an_unreachable_monitor_never_breaks_the_scheduler(): void
    {
        // The monitor being down must not cascade into the scheduler dying,
        // which would take every scheduled task with it.
        Http::fake(['*' => Http::response('nope', 500)]);
        $this->fakeDependencies(['redis']);

        // Exits FAILURE because the system IS degraded — but does not throw.
        $this->artisan('scheduler:heartbeat')->assertFailed();
    }

    public function test_nothing_is_pinged_when_no_url_is_configured(): void
    {
        // TEST has no HEALTHCHECK_URL on purpose — it must stay silent rather
        // than erroring every minute.
        config(['system.healthcheck_url' => '']);
        $this->fakeDependencies(['redis']);

        $this->artisan('scheduler:heartbeat')->assertFailed();

        Http::assertNothingSent();
    }
}
