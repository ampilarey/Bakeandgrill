<?php

declare(strict_types=1);

namespace App\Domains\Credit\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Models\Customer;
use App\Models\Order;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Texts the customer about their credit account (owner, 2026-10-03: "add
 * account approved, and any changes to the credit amount notified"; owner,
 * 2026-10-21: a sale on credit said only "Receipt for #…" and a repayment
 * said nothing).
 *
 *  - approved       the account is opened, or reopened after being blocked
 *  - limit changed  the credit limit goes up or down
 *  - charged        a sale went on the account: amount, due date, what is
 *                   owed and available, the invoice link to view or pay. It
 *                   takes the place of the till receipt text, so one sale is
 *                   one text (sent by PaymentConfirmationNotifier).
 *  - repayment      money came in, by any method, at the till, in Admin,
 *                   online or from the wallet: balance left and the next due
 *                   date, or that the account is fully paid.
 *
 * Each is its own row in Admin → Notifications with its own switch, and the
 * wording is an editable template. Sent after the change is saved; a failed
 * send is logged and never undoes the change.
 */
class CreditAccountNotifier
{
    public const TYPE_APPROVED = 'customer_credit_approved';

    public const TYPE_LIMIT_CHANGED = 'customer_credit_limit_changed';

    public const TYPE_CHARGED = 'customer_credit_charged';

    public const TYPE_REPAYMENT = 'customer_credit_repayment';

    /** The repayment row's other wording: the payment cleared the balance. */
    public const SLUG_REPAYMENT_SETTLED = 'customer_credit_repayment_settled';

    public const FALLBACK_APPROVED = 'Bake & Grill: your credit account is approved. Limit MVR {{limit}}, pay each invoice within {{terms_days}} days. Thank you!';

    public const FALLBACK_LIMIT_CHANGED = 'Bake & Grill: your credit limit has been {{change}} from MVR {{old_limit}} to MVR {{limit}}. Available now: MVR {{available}}.';

    public const FALLBACK_CHARGED = 'Bake & Grill: MVR {{amount}} charged to your credit account for #{{order_number}}, due {{due_date}}. You owe MVR {{balance}}, MVR {{available}} available. View or pay: {{link}}';

    public const FALLBACK_REPAYMENT = 'Bake & Grill: thank you, MVR {{amount}} received ({{method}}) on your credit account. You now owe MVR {{balance}}.{{next_due}}';

    public const FALLBACK_REPAYMENT_SETTLED = 'Bake & Grill: thank you, MVR {{amount}} received ({{method}}). Your credit account is fully paid.';

    public function __construct(
        private readonly SmsService $sms,
        private readonly CreditEligibilityService $eligibility,
        private readonly CustomerSmsMessageBuilder $builder,
    ) {}

    public function approved(Customer $customer): void
    {
        $vars = [
            'limit' => self::mvr((int) $customer->credit_limit_laar),
            'terms_days' => (string) (int) $customer->credit_payment_terms_days,
            'available' => self::mvr($this->eligibility->availableCreditLaar($customer)),
        ];

        $this->send(
            $customer,
            self::TYPE_APPROVED,
            self::TYPE_APPROVED,
            $vars,
            self::FALLBACK_APPROVED,
            sprintf('credit:approved:%d:%s', $customer->id, $customer->credit_approved_at?->format('YmdHis') ?? now()->format('YmdHis')),
        );
    }

    public function limitChanged(Customer $customer, int $oldLimitLaar): void
    {
        $newLimitLaar = (int) $customer->credit_limit_laar;
        if ($newLimitLaar === $oldLimitLaar) {
            return;
        }

        $vars = [
            'limit' => self::mvr($newLimitLaar),
            'old_limit' => self::mvr($oldLimitLaar),
            'available' => self::mvr($this->eligibility->availableCreditLaar($customer)),
            'change' => $newLimitLaar > $oldLimitLaar ? 'increased' : 'reduced',
        ];

        $this->send(
            $customer,
            self::TYPE_LIMIT_CHANGED,
            self::TYPE_LIMIT_CHANGED,
            $vars,
            self::FALLBACK_LIMIT_CHANGED,
            sprintf('credit:limit:%d:%d:%d:%s', $customer->id, $oldLimitLaar, $newLimitLaar, now()->format('YmdHis')),
        );
    }

    /** Whether a sale on credit is told by its own text rather than the receipt text. */
    public static function chargedTextOn(): bool
    {
        return AlertSwitch::isOn(self::TYPE_CHARGED);
    }

    /**
     * The wording for a sale charged to the account, from the receipt's
     * account lines (ReceiptAccountLines::for). The caller sends it.
     *
     * @param array{amount_laar: int, invoice_number: ?string, due_date: ?\DateTimeInterface, balance_laar: int, available_laar: int, pay_url: ?string} $credit
     */
    public function chargedText(Order $order, array $credit, ?string $phone): string
    {
        $due = $credit['due_date'] ?? null;
        $limitNote = self::limitNote((int) ($credit['limit_laar'] ?? 0), (int) $credit['available_laar'], $phone);
        $vars = [
            'amount' => self::mvr((int) $credit['amount_laar']),
            'order_number' => (string) $order->order_number,
            'invoice_number' => (string) ($credit['invoice_number'] ?? ''),
            'due_date' => $due ? Carbon::parse($due)->format('d M Y') : '',
            'balance' => self::mvr((int) $credit['balance_laar']),
            'available' => self::mvr((int) $credit['available_laar']),
            'link' => (string) ($credit['pay_url'] ?? ''),
            'limit_note' => $limitNote,
        ];

        $message = $this->builder->build(self::TYPE_CHARGED, $vars, self::FALLBACK_CHARGED, $phone);
        // A wording without {{limit_note}} of its own still carries the warning.
        if ($limitNote !== '' && !str_contains($message, trim($limitNote))) {
            $message .= $limitNote;
        }

        return $message;
    }

    /** A fifth of the limit or less is left (owner, 2026-10-21: the near-limit nudge). */
    public const NEAR_LIMIT_SHARE = 0.2;

    public static function limitNote(int $limitLaar, int $availableLaar, ?string $phone): string
    {
        if ($limitLaar <= 0 || $availableLaar > (int) floor($limitLaar * self::NEAR_LIMIT_SHARE)) {
            return '';
        }
        if (\App\Domains\Notifications\Support\CustomerSmsText::language((string) $phone) === 'dv') {
            return sprintf(' ތިބާގެ MVR %s ލިމިޓުން ބާކީ ހުރީ MVR %s އެކަނި.', self::mvr($limitLaar), self::mvr(max(0, $availableLaar)));
        }

        return sprintf(' Only MVR %s of your MVR %s limit is left.', self::mvr(max(0, $availableLaar)), self::mvr($limitLaar));
    }

    /**
     * A repayment was recorded. $source says where it came from when the
     * method alone would mislead: 'online' (BML from the pay link) or
     * 'wallet' (moved from the customer's own deposit).
     */
    public function repaymentReceived(Customer $customer, int $amountLaar, string $method, int $balanceAfterLaar, ?string $source, int $ledgerId, string $tail = ''): void
    {
        $methodWord = match (true) {
            $source === 'wallet' => 'from your wallet',
            $source === 'online' => 'online by card',
            $method === 'cash', $method === 'owner_cash' => 'cash',
            $method === 'card' => 'card',
            $method === 'bank_transfer' => 'bank transfer',
            default => str_replace('_', ' ', $method),
        };
        $settled = $balanceAfterLaar <= 0;
        $nextDue = $settled ? null : $this->eligibility->nextPaymentDueDate($customer);
        $nextDueText = $nextDue ? Carbon::parse($nextDue)->format('d M Y') : '';

        $vars = [
            'amount' => self::mvr($amountLaar),
            'method' => $methodWord,
            'balance' => self::mvr(max(0, $balanceAfterLaar)),
            'next_due_date' => $nextDueText,
            // An English fragment: the Dhivehi wording leaves it out.
            'next_due' => $nextDueText !== '' ? ' Next payment due ' . $nextDueText . '.' : '',
        ];

        $this->send(
            $customer,
            self::TYPE_REPAYMENT,
            $settled ? self::SLUG_REPAYMENT_SETTLED : self::TYPE_REPAYMENT,
            $vars,
            $settled ? self::FALLBACK_REPAYMENT_SETTLED : self::FALLBACK_REPAYMENT,
            'credit:repayment:' . $ledgerId,
            $tail,
        );
    }

    /**
     * @param array<string, string> $vars
     * @param string $tail A line added at the end (the extra that went into the wallet)
     */
    private function send(Customer $customer, string $type, string $slug, array $vars, string $fallback, string $idempotencyKey, string $tail = ''): void
    {
        $phone = trim((string) $customer->phone);
        if ($phone === '') {
            return;
        }

        try {
            $this->sms->send(new SmsMessage(
                to: $phone,
                message: $this->builder->build($slug, $vars, $fallback, $phone) . $tail,
                type: $type,
                customerId: $customer->id,
                referenceType: 'customer',
                referenceId: (string) $customer->id,
                idempotencyKey: $idempotencyKey,
            ));
        } catch (Throwable $e) {
            Log::warning('credit account SMS failed', ['type' => $type, 'customer_id' => $customer->id, 'error' => $e->getMessage()]);
        }
    }

    public static function mvr(int $laar): string
    {
        return number_format($laar / 100, 2, '.', ',');
    }
}
