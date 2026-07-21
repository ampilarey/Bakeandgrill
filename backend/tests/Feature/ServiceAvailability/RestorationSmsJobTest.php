<?php

declare(strict_types=1);

namespace Tests\Feature\ServiceAvailability;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\System\Services\ServiceAvailabilityService;
use App\Jobs\SendRestorationSmsJob;
use App\Models\RestorationSubscription;
use App\Models\ServiceIncident;
use Database\Seeders\ServiceStateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Mockery;
use Tests\TestCase;

/**
 * Stage 6 — SendRestorationSmsJob behaviour (plan §14).
 *  - Sends once, marks subscription notified
 *  - Idempotent on re-dispatch (skips already-notified)
 *  - Increments incident.notified_count on success
 *  - Anonymisation happens via the prune command, not the job.
 */
class RestorationSmsJobTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ServiceStateSeeder::class);
        Cache::flush();
    }

    private function fakeProvider(int $successCount): void
    {
        $mock = Mockery::mock(SmsProviderInterface::class);
        $mock->shouldReceive('send')
            ->times($successCount)
            ->andReturn([true, ['id' => 'stub-' . uniqid()], null]);
        $this->app->instance(SmsProviderInterface::class, $mock);
    }

    private function seedOpenIncidentAndSubscription(): RestorationSubscription
    {
        $svc = app(ServiceAvailabilityService::class);
        $svc->setState('online_checkout', [
            'status' => 'unavailable',
            'reason_type' => 'technical_maintenance',
        ]);
        $incident = ServiceIncident::query()->where('service_key', 'online_checkout')->firstOrFail();

        return RestorationSubscription::query()->create([
            'service_key' => 'online_checkout',
            'service_incident_id' => $incident->id,
            'normalized_mobile' => '+9607777777',
            'status' => 'pending',
            'consent_text_version' => 'v1',
            'requested_at' => now(),
        ]);
    }

    public function test_job_sends_and_marks_notified(): void
    {
        $this->fakeProvider(1);
        $sub = $this->seedOpenIncidentAndSubscription();

        (new SendRestorationSmsJob($sub->id))->handle(
            app(\App\Domains\Notifications\Services\SmsService::class),
            app(\App\Support\RestorationSmsBuilder::class),
        );

        $sub->refresh();
        $this->assertSame('notified', $sub->status);
        $this->assertNotNull($sub->notified_at);
        $this->assertSame(1, $sub->attempts);
    }

    public function test_re_dispatch_is_idempotent(): void
    {
        $this->fakeProvider(1);
        $sub = $this->seedOpenIncidentAndSubscription();

        $svc = app(\App\Domains\Notifications\Services\SmsService::class);
        $builder = app(\App\Support\RestorationSmsBuilder::class);

        (new SendRestorationSmsJob($sub->id))->handle($svc, $builder);
        (new SendRestorationSmsJob($sub->id))->handle($svc, $builder); // second call is a no-op

        $sub->refresh();
        $this->assertSame('notified', $sub->status);
        $this->assertSame(1, $sub->attempts, 'second dispatch must not increment attempts');
    }

    public function test_incident_notified_count_increments(): void
    {
        $this->fakeProvider(1);
        $sub = $this->seedOpenIncidentAndSubscription();
        $incidentId = $sub->service_incident_id;

        (new SendRestorationSmsJob($sub->id))->handle(
            app(\App\Domains\Notifications\Services\SmsService::class),
            app(\App\Support\RestorationSmsBuilder::class),
        );

        $incident = ServiceIncident::query()->find($incidentId);
        $this->assertSame(1, (int) $incident->notified_count);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }
}
