<?php

declare(strict_types=1);

namespace App\Domains\Deposits\Services;

use App\Domains\Deposits\Support\WalletActor;
use App\Domains\Deposits\Support\WalletTopUpRules;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\CustomerSmsText;
use App\Domains\Payments\Services\PaymentService;
use App\Domains\Payments\Services\PendingBmlPaymentHealer;
use App\Domains\System\Services\ServiceAvailabilityService;
use App\Models\Customer;
use App\Models\CustomerDepositLedger;
use App\Models\Payment;
use App\Models\SmsLog;
use App\Models\User;
use App\Models\WalletTopUp;
use App\Support\OwnerPhones;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Money into the wallet by card (owner, 2026-10-21: "when customer log in,
 * option to pay deposit to his acc").
 *
 * A top-up is a WalletTopUp row: started by the customer in the order app
 * (Account → Wallet → Add money) or sent as a link by staff (Admin and the
 * till, "Send top-up link"). Either way the card payment goes through BML
 * with payments.wallet_topup_id set and no order, and whichever of the
 * webhook, the return URL, the page or the sweep hears first, settle() credits
 * the wallet once: one top_up ledger row through DepositLedgerService::topUp,
 * which also texts the customer ("money added", with the receipt link). A
 * large top-up texts the owners (owner_deposit_large_topup).
 *
 * The rules (who may, how much, how often) are WalletTopUpRules.
 */
final class WalletTopUpService
{
    public const TYPE_LINK = 'customer_wallet_topup_link';

    public const OWNER_ALERT = 'owner_deposit_large_topup';

    public const FALLBACK_LINK = 'Bake & Grill: add {{what}} to your wallet by card here: {{link}} The link is good for 7 days.';

    /** A top-up started in the app is finished within the day or not at all. */
    public const APP_LIFETIME_HOURS = 24;

    /** A link staff send lasts a week. */
    public const LINK_LIFETIME_DAYS = 7;

    private const HEAL_THROTTLE_SECONDS = 60;

    public function __construct(
        private readonly PaymentService $payments,
        private readonly DepositLedgerService $ledger,
        private readonly SmsService $sms,
        private readonly CustomerSmsMessageBuilder $builder,
    ) {}

    /**
     * The order app's Add money: refuse what the rules refuse, then send the
     * customer to the bank.
     *
     * @return array{top_up: WalletTopUp, payment_url: string}
     */
    public function startFromApp(Customer $customer, int $amountLaar): array
    {
        $why = WalletTopUpRules::refusal($customer, $amountLaar);
        if ($why !== null) {
            abort(422, $why['message']);
        }
        app(ServiceAvailabilityService::class)->assertAvailable('online_payment');

        $topUp = WalletTopUp::create([
            'customer_id' => $customer->id,
            'token' => WalletTopUp::newToken(),
            'amount_laar' => $amountLaar,
            'amount_fixed' => true,
            'status' => WalletTopUp::STATUS_PENDING,
            'source' => WalletTopUp::SOURCE_APP,
            'expires_at' => now()->addHours(self::APP_LIFETIME_HOURS),
        ]);

        $url = $this->gatewayUrl($topUp);

        return ['top_up' => $topUp->fresh(), 'payment_url' => $url];
    }

    /**
     * Staff send the customer a link to add money: with an amount, or open
     * so the customer picks one on the page. Texted when the customer has a
     * phone; the link comes back either way so it can be copied.
     */
    public function createLink(Customer $customer, ?int $amountLaar, User $staff, ?string $note = null): WalletTopUp
    {
        $why = WalletTopUpRules::refusal($customer, $amountLaar, staff: true);
        if ($why !== null) {
            abort(422, $why['message']);
        }

        $topUp = WalletTopUp::create([
            'customer_id' => $customer->id,
            'token' => WalletTopUp::newToken(),
            'amount_laar' => $amountLaar,
            'amount_fixed' => $amountLaar !== null,
            'status' => WalletTopUp::STATUS_PENDING,
            'source' => WalletTopUp::SOURCE_LINK,
            'created_by_user_id' => $staff->id,
            'note' => $note !== null && trim($note) !== '' ? mb_substr(trim($note), 0, 200) : null,
            'expires_at' => now()->addDays(self::LINK_LIFETIME_DAYS),
        ]);

        $this->textLink($topUp, $customer);

        return $topUp->fresh();
    }

    /**
     * The page's Pay button: an open link takes the amount the customer
     * picked, and lets them change their mind until it is paid; a fixed one
     * keeps its own. Returns the bank's page.
     */
    public function pay(WalletTopUp $topUp, ?int $amountLaar): string
    {
        $topUp = $this->expireIfDue($topUp);
        if (!$topUp->isOpen()) {
            abort(422, $topUp->status === WalletTopUp::STATUS_PAID
                ? 'This top-up is already paid.'
                : 'This link has expired. Ask us for a new one, or add money from the app.');
        }
        $customer = $topUp->customer;
        $amount = $topUp->amount_fixed ? (int) $topUp->amount_laar : ($amountLaar ?? $topUp->amount_laar);
        if ($amount === null || $amount <= 0) {
            abort(422, 'Choose an amount first.');
        }
        $why = WalletTopUpRules::refusal($customer, $amount);
        if ($why !== null) {
            abort(422, $why['message']);
        }
        app(ServiceAvailabilityService::class)->assertAvailable('online_payment');

        if ((int) $topUp->amount_laar !== $amount) {
            $topUp->update(['amount_laar' => $amount]);
        }

        return $this->gatewayUrl($topUp->fresh());
    }

    /**
     * The bank confirmed the payment: credit the wallet once. Called inside
     * the confirm transaction with the payment locked and confirmed. The
     * money credited is the payment's, not the row's: an open link whose
     * amount changed after a session was opened still credits what the bank
     * took.
     */
    public function settle(WalletTopUp $topUp, Payment $payment): void
    {
        $locked = WalletTopUp::query()->whereKey($topUp->id)->lockForUpdate()->firstOrFail();
        if (CustomerDepositLedger::query()->where('payment_id', $payment->id)->exists()) {
            return;
        }
        $customer = Customer::query()->findOrFail($locked->customer_id);
        $amountLaar = (int) $payment->amount_laar;
        if ($amountLaar <= 0) {
            Log::error('wallet top-up: confirmed payment carries no amount', ['top_up_id' => $locked->id, 'payment_id' => $payment->id]);

            return;
        }
        if ($locked->status === WalletTopUp::STATUS_PAID) {
            Log::warning('wallet top-up: a second payment confirmed on one top-up; crediting it too', ['top_up_id' => $locked->id, 'payment_id' => $payment->id]);
        }

        $ledger = $this->ledger->topUp(
            $customer,
            $amountLaar,
            'online',
            WalletActor::system(),
            'BML ' . (string) $payment->provider_transaction_id,
            $locked->source === WalletTopUp::SOURCE_LINK ? 'Added by card from a top-up link' : 'Added by card from the app',
            null,
            receiptUrl: $locked->url(),
            paymentId: $payment->id,
        );

        $locked->update([
            'status' => WalletTopUp::STATUS_PAID,
            'amount_laar' => $amountLaar,
            'payment_id' => $payment->id,
            'ledger_id' => $ledger->id,
            'paid_at' => now(),
        ]);

        $balanceAfter = (int) $ledger->balance_after_laar;
        DB::afterCommit(fn () => $this->alertOwners($locked->fresh(), $customer, $amountLaar, $balanceAfter));
    }

    /**
     * Ask the bank about a top-up still shown pending and settle it if the
     * bank says paid; true when the top-up is paid afterwards. At most once a
     * minute unless forced. Never throws: a page must render whatever the
     * bank says.
     */
    public function heal(WalletTopUp $topUp, bool $force = false): bool
    {
        if ($topUp->status === WalletTopUp::STATUS_PAID) {
            return true;
        }
        $payment = $this->inFlightPayment($topUp);
        if ($payment === null) {
            return false;
        }
        if (!$force && !Cache::add('bml:heal:topup:' . $topUp->id, 1, self::HEAL_THROTTLE_SECONDS)) {
            return false;
        }

        try {
            $this->payments->confirmFromTopUpReturnUrl($topUp->id, (string) $payment->provider_transaction_id);
        } catch (\Throwable $e) {
            Log::warning('wallet top-up heal: could not ask the bank', ['top_up_id' => $topUp->id, 'error' => $e->getMessage()]);

            return false;
        }

        return $topUp->fresh()->status === WalletTopUp::STATUS_PAID;
    }

    /** The card payment the bank may still confirm, if any. */
    public function inFlightPayment(WalletTopUp $topUp): ?Payment
    {
        return Payment::query()
            ->where('wallet_topup_id', $topUp->id)
            ->whereNotNull('provider_transaction_id')
            ->whereIn('status', PendingBmlPaymentHealer::PENDING_STATUSES)
            ->where('created_at', '>=', now()->subHours(PendingBmlPaymentHealer::LOOKBACK_HOURS))
            ->latest('id')
            ->first();
    }

    /**
     * A pending top-up past its date is expired, unless a payment the bank
     * may still confirm keeps it open for the sweep.
     */
    public function expireIfDue(WalletTopUp $topUp): WalletTopUp
    {
        if ($topUp->status === WalletTopUp::STATUS_PENDING
            && $topUp->expires_at !== null
            && $topUp->expires_at->isPast()
            && $this->inFlightPayment($topUp) === null) {
            $topUp->update(['status' => WalletTopUp::STATUS_EXPIRED]);
        }

        return $topUp->fresh();
    }

    /**
     * The scheduled sweep (payments:reconcile-pending-bml): every top-up with
     * a card payment the bank may have taken while we still show it pending,
     * and every pending row past its date.
     *
     * @return array{checked: int, settled: int, expired: int}
     */
    public function sweep(): array
    {
        $ids = Payment::query()
            ->whereNotNull('wallet_topup_id')
            ->whereNotNull('provider_transaction_id')
            ->whereIn('status', PendingBmlPaymentHealer::PENDING_STATUSES)
            ->where('created_at', '>=', now()->subHours(PendingBmlPaymentHealer::LOOKBACK_HOURS))
            ->where('created_at', '<=', now()->subMinutes(PendingBmlPaymentHealer::SWEEP_MIN_AGE_MINUTES))
            ->distinct()
            ->pluck('wallet_topup_id');

        $checked = 0;
        $settled = 0;
        foreach (WalletTopUp::query()->whereIn('id', $ids)->where('status', WalletTopUp::STATUS_PENDING)->get() as $topUp) {
            $checked++;
            if ($this->heal($topUp, force: true)) {
                $settled++;
            }
        }

        $expired = 0;
        $due = WalletTopUp::query()
            ->where('status', WalletTopUp::STATUS_PENDING)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', now())
            ->get();
        foreach ($due as $topUp) {
            if ($this->expireIfDue($topUp)->status === WalletTopUp::STATUS_EXPIRED) {
                $expired++;
            }
        }

        return ['checked' => $checked, 'settled' => $settled, 'expired' => $expired];
    }

    /** Where the bank sends the customer back: the app that started it, or the link's page. */
    public function returnUrl(WalletTopUp $topUp): string
    {
        return route('bml.return', [
            'topUpId' => $topUp->id,
            'topUpToken' => $topUp->token,
            'topUpBack' => $topUp->source === WalletTopUp::SOURCE_APP ? 'app' : 'page',
        ]);
    }

    private function gatewayUrl(WalletTopUp $topUp): string
    {
        $result = $this->payments->initiateBmlTopUpPayment($topUp, $this->returnUrl($topUp));
        $url = (string) ($result['payment_url'] ?? '');
        if ($url === '') {
            abort(422, ($result['reused'] ?? false)
                ? 'This top-up is already paid.'
                : 'Online payment is not available right now. Please try again shortly.');
        }

        return $url;
    }

    private function textLink(WalletTopUp $topUp, Customer $customer): ?SmsLog
    {
        $phone = trim((string) $customer->phone);
        if ($phone === '') {
            return null;
        }
        $dv = CustomerSmsText::language($phone) === 'dv';
        $what = $topUp->amount_laar !== null
            ? 'MVR ' . WalletTopUpRules::mvr((int) $topUp->amount_laar)
            : ($dv ? 'ފައިސާ' : 'money');

        try {
            $log = $this->sms->send(new SmsMessage(
                to: $phone,
                message: $this->builder->build(self::TYPE_LINK, [
                    'what' => $what,
                    'amount' => $topUp->amount_laar !== null ? WalletTopUpRules::mvr((int) $topUp->amount_laar) : '',
                    'link' => $topUp->url(),
                    'name' => (string) ($customer->name ?? ''),
                ], self::FALLBACK_LINK, $phone),
                type: self::TYPE_LINK,
                customerId: $customer->id,
                referenceType: 'wallet_topup',
                referenceId: (string) $topUp->id,
                idempotencyKey: 'wallet-topup-link:' . $topUp->id,
                actingUserId: $topUp->created_by_user_id,
            ));
            $topUp->update(['link_sent_at' => now()]);

            return $log;
        } catch (\Throwable $e) {
            Log::warning('wallet top-up link SMS failed', ['top_up_id' => $topUp->id, 'error' => $e->getMessage()]);

            return null;
        }
    }

    /** A card top-up at or above the owner's threshold is told to the owners. */
    private function alertOwners(WalletTopUp $topUp, Customer $customer, int $amountLaar, int $balanceLaar): void
    {
        $threshold = WalletTopUpRules::ownerAlertLaar();
        if ($threshold <= 0 || $amountLaar < $threshold) {
            return;
        }
        try {
            $body = sprintf(
                'Wallet top-up by card: MVR %s from %s (%s), %s. Wallet balance now MVR %s.',
                WalletTopUpRules::mvr($amountLaar),
                $customer->name ?: 'a customer',
                $customer->phone ?: 'no phone',
                $topUp->source === WalletTopUp::SOURCE_LINK ? 'from a staff link' : 'from the app',
                WalletTopUpRules::mvr($balanceLaar),
            );
            foreach (OwnerPhones::for(self::OWNER_ALERT) as $phone) {
                $this->sms->send(new SmsMessage(
                    to: $phone,
                    message: $body,
                    type: self::OWNER_ALERT,
                    customerId: $customer->id,
                    referenceType: 'wallet_topup',
                    referenceId: (string) $topUp->id,
                    idempotencyKey: 'wallet-topup-large:' . $topUp->id . ':' . $phone,
                ));
            }
        } catch (\Throwable $e) {
            Log::warning('wallet top-up owner alert failed', ['top_up_id' => $topUp->id, 'error' => $e->getMessage()]);
        }
    }
}
