<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\SiteSetting;
use App\Services\PriceChangesService;
use App\Support\OwnerPhones;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Once a week, text the owner which items went up.
 *
 * Owner, 2026-09-21 (close the buying loop). The Price changes tab and the
 * Dashboard card show the rises to whoever opens the app; this reaches the
 * owner's phone on Monday morning without opening anything. Off unless
 * switched on in Purchasing → Settings, and silent when nothing rose.
 */
class SendPriceRiseAlert extends Command
{
    protected $signature = 'purchasing:price-rise-alert {--force : Send even if the setting is off}';

    protected $description = 'SMS the owner the items whose last buy was 10% or more above the one before';

    public const SETTING = 'ops_price_rise_alert_sms';

    public function handle(SmsService $sms, PriceChangesService $prices): int
    {
        if (!$this->option('force') && !filter_var(SiteSetting::get(self::SETTING, '0'), FILTER_VALIDATE_BOOLEAN)) {
            $this->info('Price rise SMS is off.');

            return self::SUCCESS;
        }

        $list = $prices->list();
        $rises = array_values(array_filter($list['items'], fn (array $i) => $i['change_pct'] !== null && $i['change_pct'] >= 10));
        if ($rises === []) {
            $this->info('No item is up 10% or more on its last buy.');

            return self::SUCCESS;
        }

        $lines = array_map(
            fn (array $i) => sprintf('%s +%s%% (%s→%s/%s)', $i['name'], number_format((float) $i['change_pct'], 0), self::money($i['previous']['price']), self::money($i['last']['price']), $i['unit']),
            array_slice($rises, 0, 3),
        );
        $more = count($rises) > 3 ? ' +' . (count($rises) - 3) . ' more' : '';
        $message = 'Bake & Grill price rises: ' . implode('; ', $lines) . $more . '. See Purchasing → Price changes.';

        $phones = OwnerPhones::all();
        if ($phones->isEmpty()) {
            $this->warn('Price rise SMS enabled but no owner/manager phone or business_phone set.');

            return self::SUCCESS;
        }

        $weekKey = now()->format('o-\WW');
        foreach ($phones as $phone) {
            try {
                $sms->send(new SmsMessage(
                    to: $phone,
                    message: $message,
                    type: 'system',
                    referenceType: 'price_rise_alert',
                    referenceId: $weekKey,
                    idempotencyKey: 'price-rise-alert:' . $weekKey . ':' . $phone,
                ));
            } catch (\Throwable $e) {
                Log::error('Failed to send price rise SMS', ['phone' => $phone, 'error' => $e->getMessage()]);
            }
        }

        $this->info('Price rise SMS sent to ' . $phones->count() . ' recipient(s): ' . count($rises) . ' item(s) up.');

        return self::SUCCESS;
    }

    private static function money(float $n): string
    {
        return $n !== 0.0 && abs($n) < 1 ? rtrim(rtrim(number_format($n, 4), '0'), '.') : number_format($n, 2);
    }
}
