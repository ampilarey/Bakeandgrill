<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\Support\SmsDeliveryRules;
use App\Models\SmsLog;
use Illuminate\Console\Command;

/**
 * Keeps sms_logs to the retention the owner set (SMS audit, 2026-09-24;
 * default a year, 0 keeps everything). OTP bodies are already redacted
 * at write time, so retention is about size, not secrets.
 */
class PruneSmsLogs extends Command
{
    protected $signature = 'sms:prune-logs {--days= : Override the retention setting}';

    protected $description = 'Delete sms_logs rows older than the retention setting';

    public function handle(): int
    {
        $days = $this->option('days') !== null ? (int) $this->option('days') : SmsDeliveryRules::all()['log_retention_days'];
        if ($days <= 0) {
            $this->info('SMS log retention is off: nothing pruned.');

            return self::SUCCESS;
        }

        $cutoff = now()->subDays($days);
        $deleted = 0;
        do {
            $batch = SmsLog::query()->where('created_at', '<', $cutoff)->orderBy('id')->limit(1000)->pluck('id');
            if ($batch->isEmpty()) {
                break;
            }
            $deleted += SmsLog::query()->whereIn('id', $batch)->delete();
        } while (true);

        $this->info("Pruned {$deleted} SMS log row(s) older than {$days} days.");

        return self::SUCCESS;
    }
}
