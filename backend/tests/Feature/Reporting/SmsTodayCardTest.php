<?php

declare(strict_types=1);

namespace Tests\Feature\Reporting;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-25: the dashboard's "SMS Today" said 210 at 00:27. It read the
 * last 30 days; with ?today=1 it counts since midnight, business time.
 */
class SmsTodayCardTest extends TestCase
{
    use RefreshDatabase;

    private function log(string $status, Carbon $at): void
    {
        $log = SmsLog::create(['message' => 'Hi', 'to' => '+9607000000', 'type' => 'transactional', 'status' => $status, 'segments' => 1]);
        $log->forceFill(['created_at' => $at])->save();
    }

    public function test_today_counts_since_midnight_and_the_default_stays_thirty_days(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-25 00:27:00', 'Indian/Maldives'));
        PermissionCatalogSync::sync();
        $this->log('sent', now()->subMinutes(10));      // today
        $this->log('failed', now()->subMinutes(5));     // today
        $this->log('sent', now()->subHour());           // yesterday, 23:27
        $this->log('sent', now()->subDays(10));          // this month

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $today = collect($this->getJson('/api/admin/sms/logs/stats?today=1')->assertOk()->json('stats'));
        $this->assertSame(1, (int) $today->where('status', 'sent')->sum('count'));
        $this->assertSame(1, (int) $today->where('status', 'failed')->sum('count'));

        $month = collect($this->getJson('/api/admin/sms/logs/stats')->assertOk()->json('stats'));
        $this->assertSame(3, (int) $month->where('status', 'sent')->sum('count'));
        Carbon::setTestNow();
    }
}
