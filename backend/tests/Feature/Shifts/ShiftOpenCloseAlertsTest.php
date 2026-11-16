<?php

declare(strict_types=1);

namespace Tests\Feature\Shifts;

use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Shifts\DTOs\ShiftClosedData;
use App\Domains\Shifts\DTOs\ShiftOpenedData;
use App\Domains\Shifts\Events\ShiftClosed;
use App\Domains\Shifts\Events\ShiftOpened;
use App\Models\Device;
use App\Models\Shift;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Owner, 2026-11-16: "I need an notification so that i know when the shift is opened and closed". */
class ShiftOpenCloseAlertsTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $cashier;

    private Device $till;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->owner = $this->makeOwner(['name' => 'Ahmed', 'phone' => '+9607770001']);
        $this->cashier = $this->makeStaff('staff', ['name' => 'Ariya', 'phone' => '+9607770009']);
        $this->till = Device::create(['name' => 'Front till', 'identifier' => 'T1', 'type' => 'pos', 'is_active' => true]);
    }

    public function test_opening_a_shift_tells_the_owners_who_which_till_and_the_float(): void
    {
        $this->travelTo(now()->setTimezone(config('app.timezone'))->setTime(9, 2));
        $shift = Shift::create(['user_id' => $this->cashier->id, 'device_id' => $this->till->id, 'opened_at' => now(), 'opening_cash' => 300]);
        event(new ShiftOpened(new ShiftOpenedData(shiftId: $shift->id, userId: $this->cashier->id, userName: 'Ariya', openingCash: 300.0)));
        event(new ShiftOpened(new ShiftOpenedData(shiftId: $shift->id, userId: $this->cashier->id, userName: 'Ariya', openingCash: 300.0)));

        $logs = SmsLog::where('type', 'owner_shift_opened')->get();
        $this->assertCount(1, $logs, 'once per shift and person');
        $this->assertSame('+9607770001', $logs->first()->to);
        $this->assertSame("Shift #{$shift->id} opened by Ariya on Front till at 9:02 AM. Starting cash MVR 300.00.", $logs->first()->message);
    }

    public function test_the_person_who_opened_it_is_not_told(): void
    {
        $shift = Shift::create(['user_id' => $this->owner->id, 'device_id' => $this->till->id, 'opened_at' => now(), 'opening_cash' => 300]);
        event(new ShiftOpened(new ShiftOpenedData(shiftId: $shift->id, userId: $this->owner->id, userName: 'Ahmed', openingCash: 300.0)));
        $this->assertSame(0, SmsLog::where('type', 'owner_shift_opened')->count());
    }

    public function test_closing_a_shift_tells_the_owners_the_cash_orders_and_sales(): void
    {
        $shift = Shift::create(['user_id' => $this->cashier->id, 'device_id' => $this->till->id, 'opened_at' => now()->subMinutes(500), 'closed_at' => now(), 'opening_cash' => 300]);
        event(new ShiftClosed(new ShiftClosedData(shiftId: $shift->id, userId: $this->cashier->id, userName: 'Ariya', expectedCash: 1250.0, actualCash: 1240.0, variance: -10.0, orderCount: 12, totalRevenue: 3000.0)));

        $log = SmsLog::where('type', 'owner_shift_closed')->firstOrFail();
        $this->assertSame('+9607770001', $log->to);
        $this->assertStringContainsString("Shift #{$shift->id} closed by Ariya on Front till at ", (string) $log->message);
        $this->assertStringContainsString(' (open 8h 20m). Cash is SHORT by MVR 10.00 (expected MVR 1,250.00, counted MVR 1,240.00). Started with MVR 300.00. 12 orders, sales MVR 3,000.00. See Shifts.', (string) $log->message);
    }

    public function test_a_close_that_matches_says_so(): void
    {
        $shift = Shift::create(['user_id' => $this->cashier->id, 'device_id' => $this->till->id, 'opened_at' => now()->subHour(), 'closed_at' => now(), 'opening_cash' => 300]);
        event(new ShiftClosed(new ShiftClosedData(shiftId: $shift->id, userId: $this->cashier->id, userName: 'Ariya', expectedCash: 940.0, actualCash: 940.0, variance: 0.0, orderCount: 1, totalRevenue: 640.0)));
        $this->assertStringContainsString('Cash MATCHES (expected MVR 940.00, counted MVR 940.00). Started with MVR 300.00. 1 order, sales MVR 640.00.', (string) SmsLog::where('type', 'owner_shift_closed')->firstOrFail()->message);
    }

    public function test_each_row_switched_off_stops_its_alert(): void
    {
        AlertSwitch::setAll('owner_shift_opened', false);
        AlertSwitch::setAll('owner_shift_closed', false);
        $shift = Shift::create(['user_id' => $this->cashier->id, 'device_id' => $this->till->id, 'opened_at' => now(), 'opening_cash' => 300]);
        event(new ShiftOpened(new ShiftOpenedData(shiftId: $shift->id, userId: $this->cashier->id, userName: 'Ariya', openingCash: 300.0)));
        event(new ShiftClosed(new ShiftClosedData(shiftId: $shift->id, userId: $this->cashier->id, userName: 'Ariya', expectedCash: 300.0, actualCash: 300.0, variance: 0.0, orderCount: 0, totalRevenue: 0.0)));
        $this->assertSame(0, SmsLog::whereIn('type', ['owner_shift_opened', 'owner_shift_closed'])->count());
    }
}
