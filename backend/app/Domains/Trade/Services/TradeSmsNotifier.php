<?php

declare(strict_types=1);

namespace App\Domains\Trade\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Sms\Services\SmsTemplateRenderer;
use App\Models\TradeDelivery;
use App\Models\TradeDeliveryLine;
use App\Models\User;
use Illuminate\Support\Facades\Log;

final class TradeSmsNotifier
{
    public const SLUG_DISPATCH_SHOP = 'trade_dispatch_shop';

    public const SLUG_MISMATCH_OWNER = 'trade_reconcile_mismatch_owner';

    public function __construct(
        private readonly SmsService $sms,
        private readonly SmsTemplateRenderer $renderer,
        private readonly CustomerSmsMessageBuilder $builder,
    ) {}

    public function sendDispatchToShop(TradeDelivery $delivery): void
    {
        $delivery->loadMissing(['tradeAccount.customer', 'lines.item']);
        $account = $delivery->tradeAccount;
        $customer = $account?->customer;
        if ($customer === null) {
            return;
        }

        // Explicit opt-out respect for Stage B+C (prompt requirement).
        if ($customer->sms_opt_out) {
            Log::info('trade.sms.dispatch_skipped_opt_out', ['delivery_id' => $delivery->id]);

            return;
        }

        $phone = $account->contact_phone ?: $customer->phone;
        if (! $phone) {
            return;
        }

        $summary = $delivery->lines->map(function (TradeDeliveryLine $line) {
            $name = $line->item?->name ?? 'Item';

            return $line->qty_sent.'× '.$name;
        })->take(6)->implode(', ');

        $vars = [
            'shop_name' => $account->shop_name,
            'delivery_number' => $delivery->delivery_number,
            'item_summary' => $summary !== '' ? $summary : 'your order',
        ];

        $fallback = 'Bake & Grill: we delivered {{item_summary}} to {{shop_name}} ({{delivery_number}}). Please tell us what sells.';
        $body = $this->builder->build(self::SLUG_DISPATCH_SHOP, $vars, $fallback);

        // Guard: never mention money owed in the dispatch SMS.
        if (preg_match('/\b(owe|owed|owing|invoice|bill|MVR|credit|account balance)\b/i', $body)) {
            Log::warning('trade.sms.dispatch_blocked_money_language', ['delivery_id' => $delivery->id]);
            $body = $this->renderer->renderRaw($fallback, $vars);
        }

        $this->sms->send(new SmsMessage(
            to: $phone,
            message: $body,
            type: 'trade_dispatch_shop',
            customerId: $customer->id,
            referenceType: 'trade_delivery',
            referenceId: (string) $delivery->id,
            idempotencyKey: 'trade:dispatch:sms:'.$delivery->id,
        ));
    }

    public function sendMismatchToOwner(
        TradeDelivery $delivery,
        TradeDeliveryLine $line,
        int $reportedSold,
        int $impliedSold,
    ): void {
        $delivery->loadMissing(['tradeAccount', 'lines.item']);
        $owners = User::query()
            ->whereHas('role', fn ($q) => $q->where('slug', 'owner'))
            ->where('is_active', true)
            ->get();

        $vars = [
            'shop_name' => $delivery->tradeAccount?->shop_name ?? 'Shop',
            'delivery_number' => $delivery->delivery_number,
            'item_name' => $line->item?->name ?? 'Item',
            'reported_sold' => (string) $reportedSold,
            'implied_sold' => (string) $impliedSold,
        ];

        $fallback = 'Wholesale mismatch at {{shop_name}} on {{delivery_number}}: {{item_name}} - shop said sold {{reported_sold}}, count implies sold {{implied_sold}}.';
        $body = $this->builder->build(self::SLUG_MISMATCH_OWNER, $vars, $fallback);

        foreach ($owners as $owner) {
            $phone = trim((string) ($owner->phone ?? ''));
            if ($phone === '') {
                continue;
            }

            $this->sms->send(new SmsMessage(
                to: $phone,
                message: $body,
                type: 'trade_reconcile_mismatch_owner',
                referenceType: 'trade_delivery',
                referenceId: (string) $delivery->id,
                idempotencyKey: 'trade:mismatch:sms:'.$delivery->id.':line:'.$line->id.':user:'.$owner->id,
            ));
        }
    }
}
