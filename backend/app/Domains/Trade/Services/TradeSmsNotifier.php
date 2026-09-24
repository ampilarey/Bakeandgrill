<?php

declare(strict_types=1);

namespace App\Domains\Trade\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Sms\Services\SmsTemplateRenderer;
use App\Models\Invoice;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use App\Models\TradeDeliveryLine;
use App\Models\User;
use App\Support\OwnerPhones;
use Illuminate\Support\Facades\Log;

final class TradeSmsNotifier
{
    public const SLUG_DISPATCH_SHOP = 'trade_dispatch_shop';

    public const SLUG_MISMATCH_OWNER = 'trade_reconcile_mismatch_owner';

    public const SLUG_INVOICE_RAISED_SHOP = 'trade_invoice_raised_shop';

    public const SLUG_STATEMENT_SHOP = 'trade_statement_shop';

    public const SLUG_REPORT_REMINDER_SHOP = 'trade_report_reminder_shop';

    /** The shop's own statement and delivery pages in the customer app. */
    public static function statementUrl(): string
    {
        return rtrim((string) config('app.url'), '/') . '/account/statement';
    }

    public static function deliveryUrl(TradeDelivery $delivery): string
    {
        return rtrim((string) config('app.url'), '/') . '/account/deliveries/' . $delivery->id;
    }

    private static function mvr(int $laar): string
    {
        return number_format($laar / 100, 2, '.', ',');
    }

    private function shopPhone(TradeAccount $account): ?string
    {
        $phone = $account->contact_phone ?: $account->customer?->phone;

        return $phone ? (string) $phone : null;
    }

    /**
     * Wholesale audit, 2026-09-26: the shop is told the moment an invoice
     * exists, with the amount, the due date and a link to pay.
     */
    public function sendInvoiceRaisedToShop(Invoice $invoice): void
    {
        $invoice->loadMissing('tradeAccount.customer');
        $account = $invoice->tradeAccount;
        $customer = $account?->customer;
        if ($account === null || $customer === null) {
            return;
        }
        $phone = $this->shopPhone($account);
        if ($phone === null) {
            return;
        }

        $vars = [
            'shop_name' => $account->shop_name,
            'invoice_number' => $invoice->invoice_number,
            'amount' => self::mvr((int) $invoice->total_laar),
            'due_date' => $invoice->due_date?->format('d M Y') ?? '',
            'link' => self::statementUrl(),
        ];
        $fallback = 'Bake & Grill: invoice {{invoice_number}} for {{shop_name}} is MVR {{amount}}, due {{due_date}}. View and pay: {{link}}';

        $this->sms->send(new SmsMessage(
            to: $phone,
            message: $this->builder->build(self::SLUG_INVOICE_RAISED_SHOP, $vars, $fallback),
            type: 'trade_invoice_raised_shop',
            customerId: $customer->id,
            referenceType: 'invoice',
            referenceId: (string) $invoice->id,
            idempotencyKey: 'trade:invoice:raised:' . $invoice->id,
        ));
    }

    /**
     * Monthly statement text: what is owed, what is overdue, where to pay.
     */
    public function sendStatementToShop(TradeAccount $account, string $monthLabel, int $owedLaar, int $overdueLaar, int $creditInHandLaar, string $idempotencyKey): bool
    {
        $account->loadMissing('customer');
        $customer = $account->customer;
        $phone = $this->shopPhone($account);
        if ($customer === null || $phone === null) {
            return false;
        }

        $vars = [
            'shop_name' => $account->shop_name,
            'month' => $monthLabel,
            'owed' => self::mvr($owedLaar),
            'overdue_line' => $overdueLaar > 0 ? ', of which MVR ' . self::mvr($overdueLaar) . ' is overdue' : '',
            'link' => self::statementUrl(),
        ];
        $fallback = $creditInHandLaar > 0 && $owedLaar === 0
            ? 'Bake & Grill statement for {{month}}: {{shop_name}} is in credit by MVR ' . self::mvr($creditInHandLaar) . '; it will come off your next invoice. View: {{link}}'
            : 'Bake & Grill statement for {{month}}: {{shop_name}} owes MVR {{owed}}{{overdue_line}}. View and pay: {{link}}';
        $body = $creditInHandLaar > 0 && $owedLaar === 0
            ? $this->renderer->renderRaw($fallback, $vars)
            : $this->builder->build(self::SLUG_STATEMENT_SHOP, $vars, $fallback);

        $this->sms->send(new SmsMessage(
            to: $phone,
            message: $body,
            type: 'trade_statement_shop',
            customerId: $customer->id,
            referenceType: 'trade_account',
            referenceId: (string) $account->id,
            idempotencyKey: $idempotencyKey,
        ));

        return true;
    }

    /**
     * One nudge to a shop that has not said what sold from a delivery.
     */
    public function sendReportReminderToShop(TradeDelivery $delivery): bool
    {
        $delivery->loadMissing(['tradeAccount.customer', 'lines.item']);
        $account = $delivery->tradeAccount;
        $customer = $account?->customer;
        if ($account === null || $customer === null) {
            return false;
        }
        $phone = $this->shopPhone($account);
        if ($phone === null) {
            return false;
        }

        $summary = $delivery->lines->map(fn (TradeDeliveryLine $l) => $l->qty_sent . '× ' . ($l->item?->name ?? 'Item'))->take(4)->implode(', ');
        $vars = [
            'delivery_number' => $delivery->delivery_number,
            'item_summary' => $summary !== '' ? $summary : 'your delivery',
            'link' => self::deliveryUrl($delivery),
        ];
        $fallback = 'Bake & Grill: please tell us what sold from delivery {{delivery_number}} ({{item_summary}}) so we can collect the rest. {{link}}';

        $this->sms->send(new SmsMessage(
            to: $phone,
            message: $this->builder->build(self::SLUG_REPORT_REMINDER_SHOP, $vars, $fallback),
            type: 'trade_report_reminder_shop',
            customerId: $customer->id,
            referenceType: 'trade_delivery',
            referenceId: (string) $delivery->id,
            idempotencyKey: 'trade:report-reminder:' . $delivery->id,
        ));

        return true;
    }

    /**
     * Staff hear when a shop has reported its sales, so the count can be
     * arranged.
     */
    public function sendSalesReportedToOwners(TradeDelivery $delivery): void
    {
        $delivery->loadMissing(['tradeAccount', 'lines.item']);
        $shop = $delivery->tradeAccount?->shop_name ?? 'A shop';
        $sold = $delivery->lines->map(fn (TradeDeliveryLine $l) => ($l->reported_sold_qty ?? 0) . '/' . $l->qty_sent . ' ' . ($l->item?->name ?? 'Item'))->take(5)->implode(', ');
        $body = sprintf('%s reported sales on %s: %s. Collect the returns and reconcile it in Wholesale → Deliveries.', $shop, $delivery->delivery_number, $sold !== '' ? $sold : 'see the app');

        $this->sendToOwners('owner_trade_sales_reported', $body, 'trade_delivery', (string) $delivery->id, 'trade:sales-reported:' . $delivery->id . ':' . ($delivery->reported_at?->timestamp ?? 0));
    }

    /**
     * One text per run for the owner alerts (overdue money, stock not
     * reconciled, billing due). Recipients follow the Control Center.
     */
    public function sendToOwners(string $typeKey, string $body, string $referenceType, string $referenceId, string $idempotencyBase): void
    {
        foreach (OwnerPhones::for($typeKey) as $phone) {
            $this->sms->send(new SmsMessage(
                to: $phone,
                message: $body,
                type: $typeKey,
                referenceType: $referenceType,
                referenceId: $referenceId,
                idempotencyKey: $idempotencyBase . ':' . $phone,
            ));
        }
    }

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
        if (!$phone) {
            return;
        }

        $summary = $delivery->lines->map(function (TradeDeliveryLine $line) {
            $name = $line->item?->name ?? 'Item';

            return $line->qty_sent . '× ' . $name;
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
            idempotencyKey: 'trade:dispatch:sms:' . $delivery->id,
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
                idempotencyKey: 'trade:mismatch:sms:' . $delivery->id . ':line:' . $line->id . ':user:' . $owner->id,
            ));
        }
    }
}
