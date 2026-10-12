<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Labels\ExpiringPrints;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Models\LabelPrint;
use App\Support\OwnerPhones;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Printed stock near its expiry (2026-10-12): the print log knows what was
 * stickered with which date, so once a day the owners hear which packs in
 * the freezer expire within --days (or just did), each batch once. The row
 * is "Owner: printed stock expiring" in Admin → System → Notifications.
 */
class CheckExpiringLabels extends Command
{
    public const TYPE = 'owner_labels_expiry';

    protected $signature = 'labels:check-expiring {--days=2 : Tell the owners about stock expiring within this many days}';

    protected $description = 'List printed stock expiring within N days and tell the owners once per batch';

    public function handle(SmsService $sms): int
    {
        $days = max(0, (int) $this->option('days'));
        $due = ExpiringPrints::due($days);
        if ($due === []) {
            $this->info("No printed stock expiring within {$days} days that the owners have not heard about.");

            return 0;
        }

        $this->warn("Printed stock expiring within {$days} days:");
        $this->table(
            ['Product', 'Copies', 'Batch', 'Expiry', 'Days left', 'Prints'],
            array_map(fn (array $g) => [$g['name'], $g['copies'], $g['batch_code'] ?? '-', $g['exp_date'], $g['days_left'], $g['prints']], $due),
        );

        if (!AlertSwitch::isOn(self::TYPE)) {
            $this->line('The "printed stock expiring" alert is off; nothing sent.');

            return 0;
        }
        $phones = OwnerPhones::for(self::TYPE);
        if ($phones->isEmpty()) {
            $this->warn('Printed stock expiry alert on but nobody is set to get it.');

            return 0;
        }

        $message = self::message($due, $days);
        $dateKey = now()->toDateString();
        $sent = 0;
        foreach ($phones as $phone) {
            try {
                $sms->send(new SmsMessage(
                    to: $phone,
                    message: $message,
                    type: self::TYPE,
                    referenceType: 'label_expiry_alert',
                    referenceId: $dateKey,
                    idempotencyKey: 'label-expiry:' . $dateKey . ':' . $phone,
                ));
                $sent++;
            } catch (\Throwable $e) {
                Log::error('Failed to send printed stock expiry alert', ['phone' => $phone, 'error' => $e->getMessage()]);
            }
        }
        if ($sent > 0) {
            $ids = array_merge(...array_column($due, 'print_ids'));
            LabelPrint::query()->whereIn('id', $ids)->update(['expiry_alerted_at' => now()]);
        }
        $this->info('Printed stock expiry alert sent to ' . $sent . ' recipient(s).');

        return 0;
    }

    /** @param list<array<string, mixed>> $due */
    public static function message(array $due, int $days): string
    {
        $phrases = array_map(fn (array $g) => ExpiringPrints::phrase($g), array_slice($due, 0, 4));
        $more = count($due) - count($phrases);
        $total = array_sum(array_column($due, 'copies'));

        return 'Bake & Grill: ' . $total . ' printed pack(s) expire within ' . $days . ' days or just did: '
            . implode('; ', $phrases) . ($more > 0 ? '; +' . $more . ' more' : '')
            . '. Check the freezer; Labels → Pack stickers lists them with Reprint.';
    }
}
