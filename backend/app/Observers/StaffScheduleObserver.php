<?php

declare(strict_types=1);

namespace App\Observers;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Sms\Services\SmsTemplateRenderer;
use App\Models\SmsContact;
use App\Models\SmsScheduledMessage;
use App\Models\SmsTemplate;
use App\Models\StaffNotificationPref;
use App\Models\StaffSchedule;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class StaffScheduleObserver
{
    public function __construct(
        private readonly SmsTemplateRenderer $renderer,
    ) {}

    public function created(StaffSchedule $schedule): void
    {
        $this->sendScheduleAssignedSms($schedule);
        $this->scheduleShiftReminder($schedule);
    }

    public function updated(StaffSchedule $schedule): void
    {
        // Only re-notify if the time actually changed
        if ($schedule->wasChanged(['shift_start', 'shift_end', 'date'])) {
            $this->sendScheduleAssignedSms($schedule);
            $this->cancelExistingReminder($schedule);
            $this->scheduleShiftReminder($schedule);
        }
    }

    public function deleted(StaffSchedule $schedule): void
    {
        $this->cancelExistingReminder($schedule);
    }

    private function sendScheduleAssignedSms(StaffSchedule $schedule): void
    {
        $settingEnabled = $this->isSettingEnabled('staff_sms_schedule_assigned_enabled');
        if (! $settingEnabled) {
            return;
        }

        $user = $schedule->user;
        if (! $user || ! $user->phone || ! $user->is_active) {
            return;
        }

        // Check if staff has notifications enabled
        $pref = StaffNotificationPref::where('user_id', $user->id)->first();
        if ($pref && ! $pref->notifications_enabled) {
            return;
        }

        $template = SmsTemplate::where('slug', 'schedule_assigned')->first();
        if (! $template) {
            return;
        }

        $dateLabel = Carbon::parse($schedule->date)->format('D, d M');
        $message = $this->renderer->render($template, [
            'date' => $dateLabel,
            'start' => $schedule->shift_start,
            'end' => $schedule->shift_end,
        ]);

        try {
            app(SmsService::class)->send(new SmsMessage(
                to: $user->phone,
                message: $message,
                type: 'staff_notification',
                referenceType: 'staff_schedule',
                referenceId: (string) $schedule->id,
                idempotencyKey: 'schedule-assigned:'.$schedule->id.':'.$schedule->updated_at?->timestamp,
            ));
        } catch (\Throwable $e) {
            Log::error('StaffScheduleObserver: failed to send schedule assigned SMS', [
                'schedule_id' => $schedule->id,
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function scheduleShiftReminder(StaffSchedule $schedule): void
    {
        $settingEnabled = $this->isSettingEnabled('staff_sms_shift_reminder_enabled');
        if (! $settingEnabled) {
            return;
        }

        $user = $schedule->user;
        if (! $user || ! $user->phone) {
            return;
        }

        // Find or create an SmsContact record for this staff member
        $contact = SmsContact::firstOrCreate(
            ['user_id' => $user->id, 'type' => 'staff'],
            ['name' => $user->name, 'phone' => $user->phone, 'is_enabled' => true],
        );

        $template = SmsTemplate::where('slug', 'shift_reminder')->first();
        if (! $template) {
            return;
        }

        // Schedule: 1 hour before shift start
        $shiftDateTime = Carbon::parse($schedule->date->format('Y-m-d').' '.$schedule->shift_start);
        $sendAt = $shiftDateTime->subHour();

        // Don't schedule reminders in the past
        if ($sendAt->isPast()) {
            return;
        }

        SmsScheduledMessage::create([
            'name' => 'Shift reminder: '.$user->name.' on '.$schedule->date->format('d M'),
            'to_type' => 'contact',
            'to_contact_id' => $contact->id,
            'template_id' => $template->id,
            'variables' => [
                'start' => $schedule->shift_start,
                'end' => $schedule->shift_end,
            ],
            'is_recurring' => false,
            'send_at' => $sendAt,
            'next_send_at' => $sendAt,
            'status' => 'active',
        ]);
    }

    private function cancelExistingReminder(StaffSchedule $schedule): void
    {
        $user = $schedule->user;
        if (! $user) {
            return;
        }

        // Cancel pending shift reminders for this user on this date
        $contact = SmsContact::where('user_id', $user->id)->where('type', 'staff')->first();
        if (! $contact) {
            return;
        }

        SmsScheduledMessage::where('to_contact_id', $contact->id)
            ->where('status', 'active')
            ->where('is_recurring', false)
            ->where('name', 'like', 'Shift reminder: '.$user->name.' on '.$schedule->date->format('d M').'%')
            ->update(['status' => 'cancelled']);
    }

    private function isSettingEnabled(string $key): bool
    {
        try {
            $value = \App\Models\SiteSetting::get($key, '1');

            return in_array($value, ['1', 'true', 'on', true], true);
        } catch (\Throwable) {
            return true;
        }
    }
}
