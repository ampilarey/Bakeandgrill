<?php

declare(strict_types=1);

namespace Tests\Feature\SmsModule;

use App\Domains\Notifications\Services\SmsService;
use App\Models\Role;
use App\Models\SmsContact;
use App\Models\SmsScheduledMessage;
use App\Models\SmsTemplate;
use App\Models\StaffNotificationPref;
use App\Models\StaffSchedule;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StaffScheduleNotificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Seed the required templates
        SmsTemplate::create(['name' => 'Schedule Assigned', 'slug' => 'schedule_assigned', 'body' => 'Shift assigned: {{date}}, {{start}} - {{end}}. See you at Bake & Grill!', 'type' => 'schedule_reminder', 'is_system' => true]);
        SmsTemplate::create(['name' => 'Shift Reminder', 'slug' => 'shift_reminder', 'body' => 'Reminder: Your shift today is {{start}} - {{end}}. Bake & Grill.', 'type' => 'schedule_reminder', 'is_system' => true]);

        // Keep site settings disabled to avoid SMS calls for schedule assigned
        \App\Models\SiteSetting::set('staff_sms_schedule_assigned_enabled', '0');
        \App\Models\SiteSetting::set('staff_sms_shift_reminder_enabled', '1');
    }

    private function makeSmsStaff(string $phone): User
    {
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff']);

        return User::create([
            'name' => 'Test Staff',
            'email' => $phone . '@example.mv',
            'phone' => $phone,
            'password' => bcrypt('secret'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);
    }

    /**
     * The reminder an hour before is staff:shift-reminders now (2026-10-10):
     * nothing is queued as a scheduled marketing message, and the staff
     * member is not added as an SMS contact (ShiftReminderTest has the rest).
     */
    public function test_creating_or_moving_a_schedule_queues_no_marketing_reminder(): void
    {
        $staff = $this->makeSmsStaff('+9607100100');
        $schedule = StaffSchedule::create([
            'user_id' => $staff->id,
            'date' => Carbon::tomorrow()->toDateString(),
            'shift_start' => '09:00',
            'shift_end' => '17:00',
            'is_confirmed' => true,
        ]);
        $schedule->update(['shift_start' => '14:00', 'shift_end' => '22:00']);

        $this->assertSame(0, SmsScheduledMessage::query()->count());
        $this->assertNull(SmsContact::where('user_id', $staff->id)->first());
    }

    /** Staff member with notifications disabled does not get schedule assigned SMS */
    public function test_staff_with_notifications_disabled_skips_schedule_sms(): void
    {
        $staff = $this->makeSmsStaff('+9607300300');

        StaffNotificationPref::create([
            'user_id' => $staff->id,
            'notifications_enabled' => false,
        ]);

        // Enable the event (so the check is: pref disabled not setting)
        \App\Models\SiteSetting::set('staff_sms_schedule_assigned_enabled', '1');

        $mockSmsService = $this->createMock(SmsService::class);
        $mockSmsService->expects($this->never())->method('send');
        $this->app->instance(SmsService::class, $mockSmsService);

        StaffSchedule::create([
            'user_id' => $staff->id,
            'date' => Carbon::tomorrow()->toDateString(),
            'shift_start' => '09:00',
            'shift_end' => '17:00',
            'is_confirmed' => true,
        ]);
    }
}
