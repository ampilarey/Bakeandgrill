<?php

declare(strict_types=1);

namespace App\Observers;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\Notifications\Support\NotificationChannels;
use App\Domains\Sms\Services\SmsTemplateRenderer;
use App\Models\SmsTemplate;
use App\Models\StaffNotificationPref;
use App\Models\StaffSchedule;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * Tells a staff member when a shift is put on the roster for them, or moved.
 * The reminder an hour before is staff:shift-reminders (2026-10-10); it is
 * no longer queued here as a scheduled marketing message.
 */
class StaffScheduleObserver
{
    public function __construct(
        private readonly SmsTemplateRenderer $renderer,
    ) {}

    public function created(StaffSchedule $schedule): void
    {
        $this->sendScheduleAssignedSms($schedule);
    }

    public function updated(StaffSchedule $schedule): void
    {
        // Only re-notify if the time actually changed
        if ($schedule->wasChanged(['shift_start', 'shift_end', 'date'])) {
            $this->sendScheduleAssignedSms($schedule);
        }
    }

    private function sendScheduleAssignedSms(StaffSchedule $schedule): void
    {
        // SMS off (to save cost) still sends the email and Telegram copies (owner, 2026-10-06).
        $smsOn = $this->isSettingEnabled('staff_sms_schedule_assigned_enabled');
        if (!$smsOn && !AlertSwitch::isOn('staff_schedule_assigned')) {
            return;
        }

        $user = $schedule->user;
        if (!$user || !$user->is_active) {
            return;
        }
        // No phone: by email or Telegram when either reaches them (owner, 2026-10-10).
        $to = NotificationChannels::addressFor($user);
        if ($to === null) {
            return;
        }

        // Check if staff has notifications enabled
        $pref = StaffNotificationPref::where('user_id', $user->id)->first();
        if ($pref && !$pref->notifications_enabled) {
            return;
        }

        $template = SmsTemplate::where('slug', 'schedule_assigned')->first();
        if (!$template) {
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
                to: $to,
                message: $message,
                type: 'staff_schedule_assigned',
                referenceType: 'staff_schedule',
                referenceId: (string) $schedule->id,
                idempotencyKey: 'schedule-assigned:' . $schedule->id . ':' . $schedule->updated_at?->timestamp,
                emailOnly: !$smsOn,
            ));
        } catch (\Throwable $e) {
            Log::error('StaffScheduleObserver: failed to send schedule assigned SMS', [
                'schedule_id' => $schedule->id,
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);
        }
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
