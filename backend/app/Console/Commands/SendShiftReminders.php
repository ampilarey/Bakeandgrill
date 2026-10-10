<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\Notifications\Support\NotificationChannels;
use App\Domains\Sms\Services\SmsTemplateRenderer;
use App\Models\SmsTemplate;
use App\Models\StaffNotificationPref;
use App\Models\StaffSchedule;
use Carbon\Carbon;
use Illuminate\Console\Command;

/**
 * A reminder an hour before each shift (notifications audit, 2026-10-10).
 *
 * It used to be queued as a scheduled marketing message, so it carried the
 * unsubscribe line, counted towards the one-a-day marketing limit (a second
 * shift the same day got none), waited out quiet hours and never went by
 * Telegram. Now it is a staff alert like the rest: the person's channels,
 * Telegram included, and a staff member without a phone gets it by email
 * or Telegram. Runs every five minutes; the idempotency key stops the run
 * after the one that sent it from sending again.
 */
class SendShiftReminders extends Command
{
    protected $signature = 'staff:shift-reminders';

    protected $description = 'Remind staff an hour before their shift starts';

    public const TYPE = 'staff_shift_reminder';

    /** How long before the shift the reminder goes. */
    public const LEAD_MINUTES = 60;

    /** Shifts starting this long either side of the lead are picked up, so a late run still catches them. */
    public const WINDOW_MINUTES = 10;

    public function handle(SmsService $sms, SmsTemplateRenderer $renderer): int
    {
        if (!AlertSwitch::isOn(self::TYPE)) {
            $this->info('Shift reminders are off.');

            return self::SUCCESS;
        }

        $tz = config('app.timezone', 'Indian/Maldives');
        $now = now($tz);
        $from = $now->copy()->addMinutes(self::LEAD_MINUTES - self::WINDOW_MINUTES);
        $to = $now->copy()->addMinutes(self::LEAD_MINUTES);
        $template = SmsTemplate::query()->where('slug', 'shift_reminder')->first();

        $schedules = StaffSchedule::query()
            ->with('user')
            ->where(function ($q) use ($from, $to) {
                $q->whereDate('date', $from->toDateString())->orWhereDate('date', $to->toDateString());
            })
            ->get();

        $sent = 0;
        foreach ($schedules as $schedule) {
            $start = Carbon::parse($schedule->date->format('Y-m-d') . ' ' . $schedule->shift_start, $tz);
            if ($start->lte($from) || $start->gt($to)) {
                continue;
            }
            $user = $schedule->user;
            if ($user === null || !$user->is_active) {
                continue;
            }
            $pref = StaffNotificationPref::query()->where('user_id', $user->id)->first();
            if ($pref !== null && !$pref->notifications_enabled) {
                continue;
            }

            $startLabel = substr((string) $schedule->shift_start, 0, 5);
            $endLabel = substr((string) $schedule->shift_end, 0, 5);
            $message = $template !== null
                ? $renderer->render($template, ['start' => $startLabel, 'end' => $endLabel])
                : "Reminder: your shift today is {$startLabel} - {$endLabel}. Bake & Grill.";
            $phone = trim((string) $user->phone);

            $log = $sms->send(new SmsMessage(
                to: $phone !== '' ? $phone : NotificationChannels::token($user),
                message: $message,
                type: self::TYPE,
                referenceType: 'staff_schedule',
                referenceId: (string) $schedule->id,
                idempotencyKey: 'shift-reminder:' . $schedule->id . ':' . $schedule->date->format('Ymd') . ':' . str_replace(':', '', $startLabel),
            ));
            if (in_array($log->status, ['sent', 'demo', 'queued', 'suppressed'], true)) {
                $sent++;
            }
        }

        $this->info("Shift reminders: {$sent} sent.");

        return self::SUCCESS;
    }
}
