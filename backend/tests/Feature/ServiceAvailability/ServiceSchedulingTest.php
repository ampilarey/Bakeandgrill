<?php

declare(strict_types=1);

namespace Tests\Feature\ServiceAvailability;

use App\Domains\System\Services\ServiceAvailabilityService;
use App\Jobs\SendRestorationSmsJob;
use App\Models\ServiceState;
use Database\Seeders\ServiceStateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * Stage 7 — ActivateScheduledServiceStates activator command (plan §8).
 *
 *  - starts_at ≤ now flips status to unavailable
 *  - ends_at ≤ now flips status back to available
 *  - restore path never auto-dispatches restoration SMS
 *  - re-running the command is a no-op (idempotency)
 */
class ServiceSchedulingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ServiceStateSeeder::class);
        Cache::flush();
        Queue::fake();
    }

    public function test_activation_flips_status_when_starts_at_elapsed(): void
    {
        app(ServiceAvailabilityService::class)->setState('online_delivery', [
            'starts_at' => now()->subMinute(),
            'ends_at' => now()->addHour(),
        ]);

        $this->assertSame(
            'available',
            ServiceState::query()->where('service_key', 'online_delivery')->value('status'),
        );

        $this->artisan('service-availability:activate-scheduled')->assertSuccessful();

        $this->assertSame(
            'unavailable',
            ServiceState::query()->where('service_key', 'online_delivery')->value('status'),
        );
    }

    public function test_restoration_flips_status_back_at_ends_at_without_sms(): void
    {
        $svc = app(ServiceAvailabilityService::class);
        // Put it in unavailable and set ends_at in the past.
        $svc->setState('online_delivery', [
            'status' => 'unavailable',
            'reason_type' => 'scheduled',
            'starts_at' => now()->subHour(),
            'ends_at' => now()->subMinute(),
        ]);

        $this->artisan('service-availability:activate-scheduled')->assertSuccessful();

        $this->assertSame(
            'available',
            ServiceState::query()->where('service_key', 'online_delivery')->value('status'),
        );

        // Zero restoration SMS jobs must be queued by the scheduler.
        Queue::assertNotPushed(SendRestorationSmsJob::class);
    }

    public function test_running_command_twice_is_idempotent(): void
    {
        app(ServiceAvailabilityService::class)->setState('online_delivery', [
            'starts_at' => now()->subMinute(),
            'ends_at' => now()->addHour(),
        ]);

        $this->artisan('service-availability:activate-scheduled')->assertSuccessful();
        $this->artisan('service-availability:activate-scheduled')->assertSuccessful();

        $this->assertSame(
            'unavailable',
            ServiceState::query()->where('service_key', 'online_delivery')->value('status'),
        );
    }

    public function test_future_starts_at_does_not_activate(): void
    {
        app(ServiceAvailabilityService::class)->setState('online_delivery', [
            'starts_at' => now()->addHour(),
            'ends_at' => now()->addHours(2),
        ]);

        $this->artisan('service-availability:activate-scheduled')->assertSuccessful();

        $this->assertSame(
            'available',
            ServiceState::query()->where('service_key', 'online_delivery')->value('status'),
        );
    }

    public function test_restore_clears_schedule_window_so_we_do_not_re_activate(): void
    {
        $svc = app(ServiceAvailabilityService::class);
        $svc->setState('online_delivery', [
            'status' => 'unavailable',
            'starts_at' => now()->subHour(),
            'ends_at' => now()->subMinute(),
        ]);

        $this->artisan('service-availability:activate-scheduled')->assertSuccessful();
        $row = ServiceState::query()->where('service_key', 'online_delivery')->first();
        $this->assertNull($row->starts_at);
        $this->assertNull($row->ends_at);
    }
}
