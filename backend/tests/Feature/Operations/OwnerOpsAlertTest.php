<?php

declare(strict_types=1);

namespace Tests\Feature\Operations;

use App\Domains\System\Services\QueueWorkerHeartbeat;
use App\Models\SmsLog;
use App\Support\OwnerOpsAlert;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\Helpers\ModelHelpers;
use Tests\TestCase;

/**
 * Operations audit, 2026-10-01: a failed backup or a stopped worker reached
 * nobody.
 */
class OwnerOpsAlertTest extends TestCase
{
    use ModelHelpers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->makeOwner(['phone' => '7771111']);
    }

    public function test_one_text_per_subject_per_window(): void
    {
        $this->assertTrue(OwnerOpsAlert::send('task-failed:backup:run', 'Backup failed.'));
        $this->assertFalse(OwnerOpsAlert::send('task-failed:backup:run', 'Backup failed.'));
        $this->assertTrue(OwnerOpsAlert::send('task-failed:otp:prune', 'Prune failed.'));

        $this->assertSame(2, SmsLog::where('type', OwnerOpsAlert::SMS_TYPE)->count());
    }

    public function test_a_quiet_worker_is_reported_and_a_busy_one_is_not(): void
    {
        $heartbeat = app(QueueWorkerHeartbeat::class);

        $heartbeat->record(now()->subMinutes(2));
        $this->artisan('ops:watch-queue-worker')->assertSuccessful();
        $this->assertSame(0, SmsLog::where('type', OwnerOpsAlert::SMS_TYPE)->count());

        $heartbeat->record(now()->subMinutes(25));
        $this->artisan('ops:watch-queue-worker')->assertSuccessful();
        $sms = SmsLog::where('type', OwnerOpsAlert::SMS_TYPE)->first();
        $this->assertNotNull($sms);
        $this->assertStringContainsString('has not run for 25 minutes', (string) $sms->message);
    }

    public function test_a_wiped_heartbeat_gets_time_to_come_back_before_it_counts(): void
    {
        Cache::forget(QueueWorkerHeartbeat::CACHE_KEY);

        $this->artisan('ops:watch-queue-worker')->assertSuccessful();
        $this->assertSame(0, SmsLog::where('type', OwnerOpsAlert::SMS_TYPE)->count(), 'first sight of no heartbeat starts the clock');

        $this->travel(15)->minutes();
        $this->artisan('ops:watch-queue-worker')->assertSuccessful();
        $this->assertSame(1, SmsLog::where('type', OwnerOpsAlert::SMS_TYPE)->count());
    }

    public function test_private_uploads_are_in_the_backup(): void
    {
        $this->assertContains(storage_path('app/private'), config('backup.backup.source.files.include'));
    }
}
