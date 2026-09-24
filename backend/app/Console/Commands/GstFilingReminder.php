<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Gst\Services\GstPeriodService;
use App\Domains\Gst\Services\GstReconciliationService;
use App\Domains\Gst\Services\GstSettingsService;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Support\OwnerPhones;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * GST audit, 2026-09-26: nothing said when a return was due. The period just
 * sat unlocked until somebody remembered.
 *
 * Daily. The return for the last finished period is due on the filing day of
 * the month after it ends. While that period is not locked, the owners are
 * texted N days before, on the day, and the day after if it is still open.
 * N = 0 turns the reminder off. Nothing is sent when the shop is not GST
 * registered.
 */
class GstFilingReminder extends Command
{
    protected $signature = 'gst:filing-reminder';

    protected $description = 'Text the owners when a GST return is due and the period is not locked';

    public function handle(
        GstSettingsService $settings,
        GstPeriodService $periods,
        GstReconciliationService $reconciliation,
        SmsService $sms,
    ): int {
        $config = $settings->get();
        $leadDays = (int) ($config->filing_reminder_days ?? 3);
        if (!$settings->isRegistered() || $leadDays <= 0) {
            $this->info('GST filing reminder is off.');

            return self::SUCCESS;
        }

        $today = Carbon::today();
        $current = $periods->periodKeyForDate($today);
        $period = $periods->periodKeyForDate($periods->periodStartDate($current)->subDay());

        if ($periods->isLocked($period)) {
            $this->info("GST {$period} is locked.");

            return self::SUCCESS;
        }

        $dueDay = max(1, min(28, (int) ($config->filing_due_day ?? 28)));
        $due = $periods->periodEndDate($period)->addDay()->startOfDay()->setDay($dueDay);
        $daysLeft = (int) $today->diffInDays($due, false);

        $stage = match (true) {
            $daysLeft === $leadDays => 'ahead',
            $daysLeft === 0 => 'due',
            $daysLeft === -1 => 'overdue',
            default => null,
        };
        if ($stage === null) {
            $this->info("GST {$period} is due {$due->toDateString()}; nothing to send today.");

            return self::SUCCESS;
        }

        $warnings = count(GstReconciliationService::blocking($reconciliation->warnings($period)));
        $when = match ($stage) {
            'ahead' => 'is due on ' . $due->format('j M'),
            'due' => 'is due today',
            default => 'was due yesterday',
        };
        $body = "GST return for {$period} {$when} and the period is not locked yet."
            . ($warnings > 0 ? " {$warnings} warning(s) to check first." : '')
            . ' File with MIRA, then lock it on the GST page.';

        foreach (OwnerPhones::for('owner_gst_filing_due') as $phone) {
            $sms->send(new SmsMessage(
                to: $phone,
                message: $body,
                type: 'owner_gst_filing_due',
                referenceType: 'gst_period',
                referenceId: $period,
                idempotencyKey: "gst-filing:{$period}:{$stage}:{$phone}",
            ));
        }

        $this->info("Reminded about GST {$period} ({$stage}).");

        return self::SUCCESS;
    }
}
