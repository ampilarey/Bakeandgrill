<?php

declare(strict_types=1);

namespace Tests\Feature\System;

use App\Domains\System\Services\SchedulerRunTracker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SchedulerRunTrackerTest extends TestCase
{
    use RefreshDatabase;

    public function test_record_last_run_persists_timestamp(): void
    {
        $tracker = app(SchedulerRunTracker::class);

        $tracker->recordLastRun('scheduler:heartbeat');

        $runs = $tracker->getLastRuns(['scheduler:heartbeat']);

        $this->assertNotNull($runs['scheduler:heartbeat']);
    }

    public function test_external_heartbeat_is_noop_when_url_unset(): void
    {
        config(['system.healthcheck_url' => null]);

        $tracker = app(SchedulerRunTracker::class);

        $this->assertFalse($tracker->pingExternalHeartbeat());
        $this->assertNull($tracker->lastExternalHeartbeatAt());
    }

    public function test_external_heartbeat_pings_configured_url(): void
    {
        config(['system.healthcheck_url' => 'https://hc-ping.com/test-uuid']);

        Http::fake([
            'https://hc-ping.com/test-uuid' => Http::response('', 200),
        ]);

        $tracker = app(SchedulerRunTracker::class);

        $this->assertTrue($tracker->pingExternalHeartbeat());
        $this->assertNotNull($tracker->lastExternalHeartbeatAt());

        Http::assertSent(fn ($request) => $request->url() === 'https://hc-ping.com/test-uuid');
    }

    public function test_external_heartbeat_returns_false_on_http_error(): void
    {
        config(['system.healthcheck_url' => 'https://hc-ping.com/test-uuid']);

        Http::fake([
            'https://hc-ping.com/test-uuid' => Http::response('down', 503),
        ]);

        $tracker = app(SchedulerRunTracker::class);

        $this->assertFalse($tracker->pingExternalHeartbeat());
        $this->assertNull($tracker->lastExternalHeartbeatAt());
    }

    public function test_scheduler_heartbeat_command_skips_when_url_unset(): void
    {
        config(['system.healthcheck_url' => null]);

        $this->artisan('scheduler:heartbeat')
            ->assertSuccessful();
    }

    public function test_scheduler_heartbeat_command_fails_when_ping_fails(): void
    {
        config(['system.healthcheck_url' => 'https://hc-ping.com/test-uuid']);

        Http::fake([
            'https://hc-ping.com/test-uuid' => Http::response('down', 500),
        ]);

        $this->artisan('scheduler:heartbeat')
            ->assertFailed();

        $this->assertNotNull(
            Cache::get('scheduler:last_run:scheduler:heartbeat'),
        );
    }
}
