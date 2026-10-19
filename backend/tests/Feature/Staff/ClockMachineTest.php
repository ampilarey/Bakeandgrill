<?php

declare(strict_types=1);

namespace Tests\Feature\Staff;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Shifts\ClockMachine\ClockMachine;
use App\Models\ClockDevice;
use App\Models\ClockDevicePunch;
use App\Models\TimePunch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Helpers\ModelHelpers;
use Tests\TestCase;

/** A ZKTeco clock (ADMS push) on the time clock (owner, 2026-10-19: a P160/ID). */
class ClockMachineTest extends TestCase
{
    use ModelHelpers;
    use RefreshDatabase;

    private const SN = 'CM3M214160023';

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->travelTo(now()->setDate(2026, 10, 19)->setTime(7, 0));
    }

    public function test_an_unknown_clock_waits_to_be_allowed_and_nothing_it_sends_counts(): void
    {
        $this->get('/iclock/cdata?SN=' . self::SN . '&options=all')->assertStatus(403);
        $device = ClockDevice::query()->where('serial', self::SN)->firstOrFail();
        $this->assertFalse($device->isAllowed());
        $this->assertNotNull($device->last_seen_at);

        $this->call('POST', '/iclock/cdata?SN=' . self::SN . '&table=ATTLOG', [], [], [], [], "1\t2026-10-19 08:00:00\t0\t1\t0\t0\t0")->assertStatus(403);
        $this->assertSame(0, ClockDevicePunch::query()->count());

        // A flood of made-up serials cannot fill the waiting list.
        for ($i = 0; $i < ClockMachine::MAX_WAITING + 5; $i++) {
            $this->get('/iclock/cdata?SN=FAKE' . $i);
        }
        $this->assertSame(ClockMachine::MAX_WAITING, ClockDevice::query()->whereNull('allowed_at')->count());
    }

    public function test_an_allowed_clock_gets_its_settings_in_maldives_time(): void
    {
        $this->allowedClock();
        $res = $this->get('/iclock/cdata?SN=' . self::SN . '&options=all&pushver=2.4.1')->assertOk();
        $this->assertStringContainsString('GET OPTION FROM: ' . self::SN, $res->getContent());
        $this->assertStringContainsString('TimeZone=5', $res->getContent());
        $this->assertStringContainsString('ATTLOGStamp=None', $res->getContent());
        $this->assertStringStartsWith('text/plain', (string) $res->headers->get('Content-Type'));
        $this->assertNull($res->headers->get('Set-Cookie'), 'the clock gets no session cookie');

        $this->get('/iclock/getrequest?SN=' . self::SN)->assertOk()->assertSee('OK');
        $this->call('POST', '/iclock/devicecmd?SN=' . self::SN)->assertOk();
    }

    public function test_punches_become_clock_in_and_clock_out(): void
    {
        $this->allowedClock();
        $ali = $this->makeStaff('staff', ['name' => 'Ali']);
        ClockMachine::assign($ali, '007');
        $this->assertSame('7', $ali->fresh()->clock_user_no);

        $this->sendPunches([
            "7\t2026-10-19 08:00:05\t0\t1\t0\t0\t0",
            "7\t2026-10-19 08:01:00\t0\t1\t0\t0\t0", // the same finger twice
        ], 'Stamp=100')->assertOk()->assertSee('OK: 2');

        $open = TimePunch::query()->where('user_id', $ali->id)->sole();
        $this->assertSame('2026-10-19 08:00:05', $open->clocked_in_at->format('Y-m-d H:i:s'));
        $this->assertNull($open->clocked_out_at);
        $this->assertSame(ClockMachine::SOURCE_NOTE, $open->notes);
        $this->assertSame(['in', 'double'], ClockDevicePunch::query()->orderBy('punched_at')->pluck('result')->all());

        $this->sendPunches(["7\t2026-10-19 17:00:05\t1\t1\t0\t0\t0"], 'Stamp=101');
        $open->refresh();
        $this->assertSame('2026-10-19 17:00:05', $open->clocked_out_at->format('Y-m-d H:i:s'));
        $this->assertEqualsWithDelta(9.0, $open->total_hours, 0.01);

        // The clock sends the same lines again (after a restart): nothing doubles.
        $this->sendPunches(["7\t2026-10-19 17:00:05\t1\t1\t0\t0\t0"]);
        $this->assertSame(3, ClockDevicePunch::query()->count());
        $this->assertSame(1, TimePunch::query()->count());

        // The next hello hands back the stamp, so the clock sends only what is new.
        $this->assertStringContainsString('ATTLOGStamp=101', $this->get('/iclock/cdata?SN=' . self::SN)->getContent());

        // The till's history shows it like any other punch.
        $owner = $this->makeOwner();
        $this->getJson('/api/time-clock/history?from=2026-10-19&to=2026-10-19', $this->staffHeaders($owner))->assertOk();
    }

    public function test_a_number_nobody_has_waits_until_it_is_given_to_someone(): void
    {
        $this->allowedClock();
        $this->call('POST', '/iclock/cdata?SN=' . self::SN . '&table=OPERLOG', [], [], [], [], "USER PIN=12\tName=Mariyam\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000000000000")->assertOk();
        $this->sendPunches(["12\t2026-10-19 09:00:00\t0\t15\t0\t0\t0"]);

        $this->assertSame(0, TimePunch::query()->count());
        $unmatched = ClockMachine::unmatched()->first();
        $this->assertSame('12', $unmatched['no']);
        $this->assertSame('Mariyam', $unmatched['name']);

        $owner = $this->makeOwner();
        $mariyam = $this->makeStaff('staff', ['name' => 'Mariyam']);
        $this->putJson('/api/admin/clock-machine/staff/' . $mariyam->id, ['clock_user_no' => '12'], $this->staffHeaders($owner))->assertOk();

        $punch = TimePunch::query()->where('user_id', $mariyam->id)->sole();
        $this->assertSame('2026-10-19 09:00:00', $punch->clocked_in_at->format('Y-m-d H:i:s'));
        $this->assertCount(0, ClockMachine::unmatched());

        // One number, one person.
        $other = $this->makeStaff('staff', ['name' => 'Other']);
        $this->putJson('/api/admin/clock-machine/staff/' . $other->id, ['clock_user_no' => '012'], $this->staffHeaders($owner))
            ->assertStatus(422)->assertJsonValidationErrors('clock_user_no');
    }

    public function test_punches_kept_on_the_clock_before_it_was_allowed_stay_history(): void
    {
        $this->allowedClock();
        $ali = $this->makeStaff('staff');
        ClockMachine::assign($ali, '7');
        $this->sendPunches(["7\t2026-09-01 08:00:00\t0\t1\t0\t0\t0", "7\t2026-09-01 17:00:00\t1\t1\t0\t0\t0"]);

        $this->assertSame(0, TimePunch::query()->count());
        $this->assertSame(['early', 'early'], ClockDevicePunch::query()->pluck('result')->all());
    }

    public function test_a_forgotten_clock_out_does_not_make_a_two_day_shift(): void
    {
        $this->allowedClock();
        $ali = $this->makeStaff('staff');
        ClockMachine::assign($ali, '7');
        $this->sendPunches(["7\t2026-10-19 08:00:00\t0\t1\t0\t0\t0"]);
        $this->travelTo(now()->addDay()->setTime(9, 0));
        $this->sendPunches(["7\t2026-10-20 08:30:00\t0\t1\t0\t0\t0"]);

        [$first, $second] = TimePunch::query()->orderBy('clocked_in_at')->get()->all();
        $this->assertSame(ClockMachine::FORGOT_NOTE, $first->notes);
        $this->assertEquals(0.0, $first->total_hours);
        $this->assertNull($second->clocked_out_at);
        $this->assertSame('2026-10-20 08:30:00', $second->clocked_in_at->format('Y-m-d H:i:s'));
    }

    public function test_admin_allows_a_waiting_clock_and_only_staff_managers_can(): void
    {
        $this->get('/iclock/cdata?SN=' . self::SN);
        $device = ClockDevice::query()->sole();
        $owner = $this->makeOwner();
        $cashier = $this->makeStaff('staff');

        $this->getJson('/api/admin/clock-machine', $this->staffHeaders($cashier))->assertForbidden();
        $this->app['auth']->forgetGuards();

        $list = $this->getJson('/api/admin/clock-machine', $this->staffHeaders($owner))->assertOk();
        $list->assertJsonPath('devices.0.serial', self::SN);
        $list->assertJsonPath('devices.0.allowed', false);
        $this->assertStringStartsWith('http://', $list->json('push_url'));

        $this->patchJson('/api/admin/clock-machine/devices/' . $device->id, ['allowed' => true, 'name' => 'Kitchen door'], $this->staffHeaders($owner))->assertOk();
        $this->assertTrue($device->fresh()->isAllowed());
        $this->get('/iclock/cdata?SN=' . self::SN)->assertOk();

        // An allowed clock is stopped before it can be removed.
        $this->deleteJson('/api/admin/clock-machine/devices/' . $device->id, [], $this->staffHeaders($owner))->assertStatus(422);
        $this->patchJson('/api/admin/clock-machine/devices/' . $device->id, ['allowed' => false], $this->staffHeaders($owner))->assertOk();
        $this->deleteJson('/api/admin/clock-machine/devices/' . $device->id, [], $this->staffHeaders($owner))->assertOk();
        $this->assertSame(0, ClockDevice::query()->count());
    }

    private function allowedClock(): ClockDevice
    {
        return ClockDevice::query()->create(['serial' => self::SN, 'allowed_at' => now()]);
    }

    /** @param list<string> $lines */
    private function sendPunches(array $lines, string $extra = '')
    {
        return $this->call('POST', '/iclock/cdata?SN=' . self::SN . '&table=ATTLOG' . ($extra !== '' ? '&' . $extra : ''), [], [], [], ['CONTENT_TYPE' => 'text/plain'], implode("\n", $lines) . "\n");
    }
}
