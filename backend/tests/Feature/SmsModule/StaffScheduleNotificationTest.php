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
            'name'      => 'Test Staff',
            'email'     => $phone . '@example.mv',
            'phone'     => $phone,
            'password'  => bcrypt('secret'),
            'role_id'   => $role->id,
            'is_active' => true,
        ]);
    }

    /** Creating a schedule creates a shift reminder scheduled message */
    public function test_creating_schedule_creates_shift_reminder(): void
    {
        $staff = $this->makeSmsStaff('+9607100100');
        $tomorrow = Carbon::tomorrow();

        StaffSchedule::create([
            'user_id'      => $staff->id,
            'date'         => $tomorrow->toDateString(),
            'shift_start'  => '09:00',
            'shift_end'    => '17:00',
            'is_confirmed' => true,
        ]);

        // An SmsContact should have been created for the staff member
        $contact = SmsContact::where('user_id', $staff->id)->first();
        $this->assertNotNull($contact);

        // A shift reminder scheduled message should exist
        $reminder = SmsScheduledMessage::where('to_contact_id', $contact->id)->first();
        $this->assertNotNull($reminder);
        $this->assertEquals('active', $reminder->status);

        // The reminder should be 1 hour before shift start
        $expectedSendAt = Carbon::parse($tomorrow->toDateString() . ' 09:00')->subHour();
        $this->assertEquals($expectedSendAt->toDateTimeString(), $reminder->next_send_at->toDateTimeString());
    }

    /** Updating a schedule cancels old reminder and creates new one */
    public function test_updating_schedule_replaces_reminder(): void
    {
        $staff = $this->makeSmsStaff('+9607200200');
        $tomorrow = Carbon::tomorrow();

        $schedule = StaffSchedule::create([
            'user_id'      => $staff->id,
            'date'         => $tomorrow->toDateString(),
            'shift_start'  => '09:00',
            'shift_end'    => '17:00',
            'is_confirmed' => true,
        ]);

        // Now update the shift time
        $schedule->update([
            'shift_start' => '14:00',
            'shift_end'   => '22:00',
        ]);

        $contact = SmsContact::where('user_id', $staff->id)->first();
        $this->assertNotNull($contact);

        // Should have 1 active reminder (for the updated time) and any cancelled ones
        $activeReminders = SmsScheduledMessage::where('to_contact_id', $contact->id)->where('status', 'active')->get();
        $this->assertCount(1, $activeReminders);

        $expectedSendAt = Carbon::parse($tomorrow->toDateString() . ' 14:00')->subHour();
        $this->assertEquals($expectedSendAt->toDateTimeString(), $activeReminders->first()->next_send_at->toDateTimeString());
    }

    /** Staff member with notifications disabled does not get schedule assigned SMS */
    public function test_staff_with_notifications_disabled_skips_schedule_sms(): void
    {
        $staff = $this->makeSmsStaff('+9607300300');

        StaffNotificationPref::create([
            'user_id'               => $staff->id,
            'notifications_enabled' => false,
        ]);

        // Enable the event (so the check is: pref disabled not setting)
        \App\Models\SiteSetting::set('staff_sms_schedule_assigned_enabled', '1');

        $mockSmsService = $this->createMock(SmsService::class);
        $mockSmsService->expects($this->never())->method('send');
        $this->app->instance(SmsService::class, $mockSmsService);

        StaffSchedule::create([
            'user_id'      => $staff->id,
            'date'         => Carbon::tomorrow()->toDateString(),
            'shift_start'  => '09:00',
            'shift_end'    => '17:00',
            'is_confirmed' => true,
        ]);
    }
}
