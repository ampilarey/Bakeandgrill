<?php

declare(strict_types=1);

namespace App\Domains\Deposits\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\CustomerSmsText;
use App\Models\Customer;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Texts the customer about their wallet, the money they leave with the shop
 * (owner, 2026-10-21: it never spoke). Money added, money paid out, the
 * wallet put on hold or made active again; a sale paid from it is told by
 * the receipt text itself (PaymentConfirmationNotifier), one sale one text.
 * A refund paid into it keeps its own text (customer_refund_to_wallet).
 *
 * Each is its own row in Admin → Notifications with its own switch, and the
 * wording is an editable template. Sent after the change is saved; a failed
 * send is logged and never undoes the change.
 */
final class DepositNotifier
{
    public const TYPE_RECEIVED = 'customer_deposit_received';

    public const TYPE_PAID_OUT = 'customer_deposit_paid_out';

    public const TYPE_ON_HOLD = 'customer_deposit_on_hold';

    /** The on-hold row's other wording: the wallet is active again. */
    public const SLUG_ACTIVE = 'customer_deposit_active';

    public const FALLBACK_RECEIVED = 'Bake & Grill: MVR {{amount}} added to your wallet ({{method}}). Wallet balance: MVR {{balance}}.';

    public const TYPE_SHARED = 'customer_wallet_shared';

    public const FALLBACK_SHARED = 'Bake & Grill: {{owner}} shares their wallet with you. When your own wallet is empty, you can pay from it at the counter and in the order app.';

    public const TYPE_MEMBER_SPEND = 'customer_wallet_member_spend';

    public const FALLBACK_MEMBER_SPEND = 'Bake & Grill: MVR {{amount}} paid from your wallet by {{member}} for #{{order_number}}. Wallet balance: MVR {{balance}}.';

    public const FALLBACK_PAID_OUT = 'Bake & Grill: MVR {{amount}} paid out from your wallet ({{method}}). Wallet balance: MVR {{balance}}.';

    public const FALLBACK_ON_HOLD = 'Bake & Grill: your wallet has been put on hold and cannot be used for now. Please contact us.';

    public const FALLBACK_ACTIVE = 'Bake & Grill: your wallet is active again. Balance: MVR {{balance}}.';

    public function __construct(
        private readonly SmsService $sms,
        private readonly CustomerSmsMessageBuilder $builder,
    ) {}

    /**
     * Money added. A card top-up (owner, 2026-10-21) carries the link to its
     * own page as the receipt, appended when the wording has no {{receipt}}.
     */
    public function received(Customer $customer, int $amountLaar, string $method, int $balanceAfterLaar, int $ledgerId, ?string $receiptUrl = null, int $bonusLaar = 0): void
    {
        $receipt = $receiptUrl !== null && $receiptUrl !== '' ? ' Receipt: ' . $receiptUrl : '';
        // A bonus on the top-up (phase 4) rides inside the same text.
        $bonusNote = '';
        if ($bonusLaar > 0) {
            $bonusNote = CustomerSmsText::language((string) $customer->phone) === 'dv'
                ? sprintf(' އިތުރަށް MVR %s ބޯނަސް.', self::mvr($bonusLaar))
                : ' Plus a MVR ' . self::mvr($bonusLaar) . ' bonus.';
        }
        $this->send($customer, self::TYPE_RECEIVED, self::TYPE_RECEIVED, [
            'amount' => self::mvr($amountLaar),
            'method' => self::methodWord($method),
            'balance' => self::mvr($balanceAfterLaar),
            'receipt' => $receipt,
            'bonus_note' => $bonusNote,
        ], self::FALLBACK_RECEIVED, 'deposit:received:' . $ledgerId, $bonusNote . $receipt);
    }

    /** The family wallet (phase 4): someone shared their wallet with this customer. */
    public function shared(Customer $member, Customer $owner): void
    {
        $this->send($member, self::TYPE_SHARED, self::TYPE_SHARED, [
            'owner' => (string) ($owner->name ?: 'A customer'),
        ], self::FALLBACK_SHARED, sprintf('wallet:shared:%d:%d', $owner->id, $member->id));
    }

    /** The wallet's owner hears when someone they share it with pays from it. */
    public function memberSpent(Customer $owner, int $amountLaar, Customer $member, \App\Models\Order $order, int $balanceAfterLaar, int $ledgerId): void
    {
        $this->send($owner, self::TYPE_MEMBER_SPEND, self::TYPE_MEMBER_SPEND, [
            'amount' => self::mvr($amountLaar),
            'member' => (string) ($member->name ?: $member->phone),
            'order_number' => (string) ($order->order_number ?? $order->id),
            'balance' => self::mvr($balanceAfterLaar),
        ], self::FALLBACK_MEMBER_SPEND, 'deposit:member-spend:' . $ledgerId);
    }

    public function paidOut(Customer $customer, int $amountLaar, string $method, int $balanceAfterLaar, int $ledgerId): void
    {
        $this->send($customer, self::TYPE_PAID_OUT, self::TYPE_PAID_OUT, [
            'amount' => self::mvr($amountLaar),
            'method' => self::methodWord($method),
            'balance' => self::mvr($balanceAfterLaar),
        ], self::FALLBACK_PAID_OUT, 'deposit:paid-out:' . $ledgerId);
    }

    /** Frozen tells them; active again after a freeze tells them too. A close says nothing. */
    public function statusChanged(Customer $customer, string $from, string $to, int $balanceLaar): void
    {
        if ($to === 'frozen' && $from !== 'frozen') {
            $this->send($customer, self::TYPE_ON_HOLD, self::TYPE_ON_HOLD, [
                'balance' => self::mvr($balanceLaar),
            ], self::FALLBACK_ON_HOLD, sprintf('deposit:on-hold:%d:%s', $customer->id, now()->format('YmdHis')));

            return;
        }
        if ($to === 'active' && $from === 'frozen') {
            $this->send($customer, self::TYPE_ON_HOLD, self::SLUG_ACTIVE, [
                'balance' => self::mvr($balanceLaar),
            ], self::FALLBACK_ACTIVE, sprintf('deposit:active:%d:%s', $customer->id, now()->format('YmdHis')));
        }
    }

    /**
     * The line a receipt text carries when the sale was paid from the
     * wallet, in the customer's language. Appended by the sender when the
     * wording has no {{wallet_note}} of its own.
     */
    /** @param string|null $sharedFrom The wallet owner's name when a family member paid from a wallet shared with them (phase 4). */
    public static function walletNote(int $amountLaar, int $balanceLaar, ?string $phone, ?string $sharedFrom = null): string
    {
        if (CustomerSmsText::language((string) $phone) === 'dv') {
            return $sharedFrom !== null
                ? sprintf(' %s ގެ ވޯލެޓުން MVR %s، ބާކީ MVR %s.', $sharedFrom, self::mvr($amountLaar), self::mvr($balanceLaar))
                : sprintf(' ވޯލެޓުން MVR %s، ބާކީ MVR %s.', self::mvr($amountLaar), self::mvr($balanceLaar));
        }

        return $sharedFrom !== null
            ? sprintf(" MVR %s from %s's wallet, balance MVR %s.", self::mvr($amountLaar), $sharedFrom, self::mvr($balanceLaar))
            : sprintf(' MVR %s from your wallet, balance MVR %s.', self::mvr($amountLaar), self::mvr($balanceLaar));
    }

    public static function methodWord(string $method): string
    {
        return match ($method) {
            'cash' => 'cash',
            'card' => 'card',
            'bank_transfer' => 'bank transfer',
            'online', 'bml' => 'online by card',
            'gift_card' => 'gift card',
            default => str_replace('_', ' ', $method),
        };
    }

    /**
     * @param array<string, string> $vars
     * @param string $tail A line the text must carry; appended when the wording left it out.
     */
    private function send(Customer $customer, string $type, string $slug, array $vars, string $fallback, string $idempotencyKey, string $tail = ''): void
    {
        $phone = trim((string) $customer->phone);
        if ($phone === '') {
            return;
        }

        $message = $this->builder->build($slug, $vars, $fallback, $phone);
        // The tail may be two lines (a bonus note and a receipt): each is added only when missing.
        foreach (preg_split('/(?<=\.)\s+(?=Receipt: )/', $tail) ?: [] as $piece) {
            $piece = ' ' . trim($piece);
            if (trim($piece) !== '' && !str_contains($message, trim($piece))) {
                $message .= $piece;
            }
        }

        try {
            $this->sms->send(new SmsMessage(
                to: $phone,
                message: $message,
                type: $type,
                customerId: $customer->id,
                referenceType: 'customer',
                referenceId: (string) $customer->id,
                idempotencyKey: $idempotencyKey,
            ));
        } catch (Throwable $e) {
            Log::warning('wallet SMS failed', ['type' => $type, 'customer_id' => $customer->id, 'error' => $e->getMessage()]);
        }
    }

    public static function mvr(int $laar): string
    {
        return number_format($laar / 100, 2, '.', ',');
    }
}
