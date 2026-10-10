<?php

declare(strict_types=1);

namespace Tests\Feature\SmsModule;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\Notifications\Support\SmsDeliveryRules;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\SmsTemplate;
use App\Models\StaffSchedule;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

/**
 * Notifications audit, 2026-10-10: the reminder an hour before a shift is a
 * staff alert (staff:shift-reminders), not a scheduled marketing message.
 */
class ShiftReminderTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<array{0: string, 1: string}> */
    private array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-10-12 08:05:00', config('app.timezone')));

        SmsTemplate::query()->updateOrCreate(['slug' => 'shift_reminder'], [
            'name' => 'Shift Reminder', 'type' => 'schedule_reminder', 'is_system' => true,
            'body' => 'Reminder: Your shift today is {{start}} - {{end}}. Bake & Grill.',
        ]);
        SiteSetting::set('staff_sms_schedule_assigned_enabled', '0');

        $provider = Mockery::mock(SmsProviderInterface::class);
        $provider->shouldReceive('send')->andReturnUsing(function (string $to, string $message): array {
            $this->sent[] = [$to, $message];

            return [true, ['ok' => true], null];
        });
        $this->app->instance(SmsProviderInterface::class, $provider);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        Mockery::close();
        parent::tearDown();
    }

    private function staff(?string $phone, string $email = 'shift.staff@example.mv'): User
    {
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff']);

        return User::create([
            'name' => 'Shift Staff',
            'email' => $email,
            'phone' => $phone,
            'password' => bcrypt('secret'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);
    }

    private function shift(User $user, string $start, string $end = '17:00', ?string $date = null): StaffSchedule
    {
        return StaffSchedule::create([
            'user_id' => $user->id,
            'date' => $date ?? '2026-10-12',
            'shift_start' => $start,
            'shift_end' => $end,
            'is_confirmed' => true,
        ]);
    }

    public function test_the_reminder_goes_an_hour_before_as_a_staff_alert_and_only_once(): void
    {
        $user = $this->staff('7100100');
        $this->shift($user, '09:00');

        $this->artisan('staff:shift-reminders')->assertSuccessful();
        $this->artisan('staff:shift-reminders')->assertSuccessful();

        $logs = SmsLog::where('type', 'staff_shift_reminder')->get();
        $this->assertCount(1, $logs);
        $this->assertSame('sent', $logs[0]->status);
        $this->assertCount(1, $this->sent);
        $this->assertStringContainsString('09:00 - 17:00', $this->sent[0][1]);
    }

    public function test_a_shift_further_off_waits_for_its_own_hour(): void
    {
        $this->shift($this->staff('7100101'), '14:00', '22:00');

        $this->artisan('staff:shift-reminders')->assertSuccessful();
        $this->assertSame(0, SmsLog::where('type', 'staff_shift_reminder')->count());

        Carbon::setTestNow(Carbon::parse('2026-10-12 13:02:00', config('app.timezone')));
        $this->artisan('staff:shift-reminders')->assertSuccessful();
        $this->assertSame(1, SmsLog::where('type', 'staff_shift_reminder')->count());
    }

    public function test_marketing_rules_no_longer_touch_it(): void
    {
        // The opt-out line, the one-a-day marketing limit (already used up
        // today) and quiet hours all held or changed the old reminder.
        SiteSetting::set(SmsDeliveryRules::OPT_OUT_LINE, 'Stop: {url}');
        SiteSetting::set(SmsDeliveryRules::MARKETING_CAP, '1');
        SiteSetting::set(SmsDeliveryRules::QUIET_ENABLED, '1');
        SiteSetting::set(SmsDeliveryRules::QUIET_START, '00:00');
        SiteSetting::set(SmsDeliveryRules::QUIET_END, '23:59');
        SiteSetting::set(SmsDeliveryRules::QUIET_ALERTS, '1');
        SmsLog::create([
            'message' => 'Promo', 'to' => '+9607100102', 'type' => 'marketing_campaign', 'status' => 'sent',
            'encoding' => 'GSM-7', 'segments' => 1, 'cost_estimate_mvr' => 0.25, 'provider' => 'dhiraagu',
        ]);
        $this->shift($this->staff('7100102'), '09:00');

        $this->artisan('staff:shift-reminders')->assertSuccessful();

        $log = SmsLog::where('type', 'staff_shift_reminder')->firstOrFail();
        $this->assertSame('sent', $log->status);
        $this->assertStringNotContainsString('Stop:', $this->sent[0][1]);
    }

    public function test_staff_without_a_phone_get_it_by_email(): void
    {
        $user = $this->staff(null, 'no.phone@example.mv');
        $this->shift($user, '09:00');

        $this->artisan('staff:shift-reminders')->assertSuccessful();

        $log = SmsLog::where('type', 'staff_shift_reminder')->firstOrFail();
        $this->assertSame('user:' . $user->id, $log->to);
        $this->assertTrue($log->reachedRecipient());
        $this->assertSame([], $this->sent);
    }

    public function test_switched_off_on_its_row_nothing_goes(): void
    {
        AlertSwitch::setAll('staff_shift_reminder', false);
        $this->shift($this->staff('7100103'), '09:00');

        $this->artisan('staff:shift-reminders')->expectsOutputToContain('off')->assertSuccessful();
        $this->assertSame(0, SmsLog::where('type', 'staff_shift_reminder')->count());
    }
}
