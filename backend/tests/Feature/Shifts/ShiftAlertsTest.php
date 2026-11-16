<?php

declare(strict_types=1);

namespace Tests\Feature\Shifts;

use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Device;
use App\Models\Shift;
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

        // Notifications audit, 2026-10-10: the number only says when; 0 is
        // refused and off is the alert's row in Admin → Notifications.
        Sanctum::actingAs($this->owner, ['staff']);
        $this->patchJson('/api/admin/ops/alerts', ['shift_open_alert_hours' => 0])->assertStatus(422);
        AlertSwitch::setAll('owner_shift_left_open', false);
        SmsLog::query()->delete();
        $this->artisan('shifts:alert-open')->assertSuccessful();
        $this->assertSame(0, SmsLog::where('type', 'owner_shift_left_open')->count(), 'the row switched off stops it');
    }
}
