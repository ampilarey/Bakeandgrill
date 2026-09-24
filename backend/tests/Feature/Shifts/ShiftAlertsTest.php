<?php

declare(strict_types=1);

namespace Tests\Feature\Shifts;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Shifts\DTOs\ShiftClosedData;
use App\Domains\Shifts\Events\ShiftClosed;
use App\Models\Device;
use App\Models\Shift;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Ops audit, 2026-09-25: a till left open too long, and a close that lands
 * short or over by more than the threshold, both text the owners.
 */
class ShiftAlertsTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $cashier;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->owner = $this->makeOwner(['name' => 'Ahmed', 'phone' => '+9607770001']);
        $this->cashier = $this->makeStaff('staff', ['name' => 'Cashier', 'phone' => '+9607770009']);
    }

    public function test_a_shift_open_longer_than_the_threshold_texts_the_owners_once_a_day(): void
    {
        $device = Device::create(['name' => 'Front till', 'identifier' => 'T1', 'type' => 'pos', 'is_active' => true]);
        $stale = Shift::create(['user_id' => $this->cashier->id, 'device_id' => $device->id, 'opened_at' => now()->subHours(15), 'opening_cash' => 100]);
        Shift::create(['user_id' => $this->owner->id, 'device_id' => $device->id, 'opened_at' => now()->subHours(2), 'opening_cash' => 100]);

        $this->artisan('shifts:alert-open')->assertSuccessful();
        $this->artisan('shifts:alert-open')->assertSuccessful();
        $logs = SmsLog::where('type', 'owner_shift_left_open')->get();
        $this->assertCount(1, $logs, 'one text a day per set of open shifts');
        $this->assertSame('+9607770001', $logs->first()->to);
        $this->assertStringContainsString("#{$stale->id} Cashier on Front till", (string) $logs->first()->message);
        $this->assertStringNotContainsString('Ahmed on', (string) $logs->first()->message, 'the two-hour shift is fine');

        Sanctum::actingAs($this->owner, ['staff']);
        $this->patchJson('/api/admin/ops/alerts', ['shift_open_alert_hours' => 0])->assertOk()->assertJsonPath('settings.shift_open_alert_hours', 0);
        SmsLog::query()->delete();
        $this->artisan('shifts:alert-open')->assertSuccessful();
        $this->assertSame(0, SmsLog::where('type', 'owner_shift_left_open')->count(), '0 switches it off');
    }

    public function test_a_close_with_a_variance_at_or_over_the_threshold_texts_the_owners(): void
    {
        $this->assertSame(50.0, (float) SiteSetting::get('ops_shift_variance_alert_mvr', '50'));
        event(new ShiftClosed(new ShiftClosedData(shiftId: 7, userId: $this->cashier->id, userName: 'Cashier', expectedCash: 1250.0, actualCash: 1170.0, variance: -80.0, orderCount: 12, totalRevenue: 3000.0)));
        $log = SmsLog::where('type', 'owner_shift_variance')->firstOrFail();
        $this->assertSame('Shift #7 closed by Cashier is SHORT by MVR 80.00 (expected MVR 1,250.00, counted MVR 1,170.00). See Shifts.', $log->message);

        event(new ShiftClosed(new ShiftClosedData(shiftId: 8, userId: $this->cashier->id, userName: 'Cashier', expectedCash: 100.0, actualCash: 120.0, variance: 20.0, orderCount: 1, totalRevenue: 100.0)));
        $this->assertSame(1, SmsLog::where('type', 'owner_shift_variance')->count(), 'MVR 20 is under the threshold');

        Sanctum::actingAs($this->owner, ['staff']);
        $this->patchJson('/api/admin/ops/alerts', ['shift_variance_alert_mvr' => 10])->assertOk()->assertJsonPath('settings.shift_variance_alert_mvr', 10);
        event(new ShiftClosed(new ShiftClosedData(shiftId: 9, userId: $this->cashier->id, userName: 'Cashier', expectedCash: 100.0, actualCash: 120.0, variance: 20.0, orderCount: 1, totalRevenue: 100.0)));
        $this->assertStringContainsString('OVER by MVR 20.00', (string) SmsLog::where('type', 'owner_shift_variance')->orderByDesc('id')->firstOrFail()->message);
    }
}
