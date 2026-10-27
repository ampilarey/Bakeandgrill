<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\System\ErrorTracker;
use App\Models\ErrorEvent;
use App\Support\OwnerPhones;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * Yesterday's errors in one message each morning (iruali import plan,
 * feature 17): how many, how many kinds, and the most frequent. Nothing goes
 * on a day without errors. Also forgets rows older than 30 days. The row is
 * "Owner: daily error report" in Admin → System → Notifications.
 */
class SendErrorDigest extends Command
{
    protected $signature = 'errors:digest {--date= : The day to report (Y-m-d), yesterday by default}';

    protected $description = "Send the owners yesterday's error report and forget errors older than 30 days";

    public function handle(SmsService $sms): int
    {
        $pruned = ErrorEvent::query()->whereDate('day', '<', now()->subDays(30)->toDateString())->delete();
        if ($pruned > 0) {
            $this->line("Forgot {$pruned} error row(s) older than 30 days.");
        }

        $day = $this->option('date') ? Carbon::parse((string) $this->option('date')) : now()->subDay();
        $events = ErrorEvent::query()->whereDate('day', $day->toDateString())->orderByDesc('count')->get();
        if ($events->isEmpty()) {
            $this->info('No errors on ' . $day->toDateString() . '; nothing sent.');

            return self::SUCCESS;
        }

        $this->table(['Count', 'Error', 'Where', 'Payment'], $events->map(fn (ErrorEvent $e) => [
            $e->count, class_basename($e->exception) . ': ' . mb_strimwidth((string) $e->message, 0, 60, '…'), $e->file . ':' . $e->line, $e->payment ? 'yes' : '',
        ])->all());

        if (!AlertSwitch::isOn(ErrorTracker::DIGEST_TYPE)) {
            $this->line('The daily error report is off; nothing sent.');

            return self::SUCCESS;
        }
        $phones = OwnerPhones::for(ErrorTracker::DIGEST_TYPE);
        if ($phones->isEmpty()) {
            $this->warn('Daily error report on but nobody is set to get it.');

            return self::SUCCESS;
        }

        $message = self::message($events->all(), $day);
        $sent = 0;
        foreach ($phones as $phone) {
            try {
                $sms->send(new SmsMessage(
                    to: $phone,
                    message: $message,
                    type: ErrorTracker::DIGEST_TYPE,
                    referenceType: 'error_digest',
                    referenceId: $day->toDateString(),
                    idempotencyKey: 'error-digest:' . $day->toDateString() . ':' . $phone,
                ));
                $sent++;
            } catch (\Throwable $e) {
                Log::error('Failed to send the daily error report', ['phone' => $phone, 'error' => $e->getMessage()]);
            }
        }
        $this->info("Daily error report sent to {$sent} recipient(s).");

        return self::SUCCESS;
    }

    /** @param list<ErrorEvent> $events (most frequent first) */
    public static function message(array $events, Carbon $day): string
    {
        $total = array_sum(array_map(fn (ErrorEvent $e) => $e->count, $events));
        $kinds = count($events);
        $payment = count(array_filter($events, fn (ErrorEvent $e) => $e->payment));
        $top = array_map(
            fn (ErrorEvent $e) => $e->count . '× ' . ErrorTracker::describe((string) $e->exception, (string) $e->message, (string) $e->file, (int) $e->line),
            array_slice($events, 0, 3),
        );

        return 'Bake & Grill: ' . $total . ' error' . ($total === 1 ? '' : 's') . ' on ' . $day->format('j M')
            . ' (' . $kinds . ' kind' . ($kinds === 1 ? '' : 's') . ($payment > 0 ? ', ' . $payment . ' in payments' : '') . '). '
            . 'Most: ' . implode('; ', $top) . '. Details: Admin → System → Health.';
    }
}
