<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Deposits\Services\DepositLedgerService;
use App\Domains\Payments\Services\GiftCardCodeService;
use App\Domains\Payments\Services\GiftCardRedemptionService;
use App\Domains\Payments\Services\PaymentService;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerDepositAccount;
use App\Models\GiftCardTransaction;
use App\Models\Order;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The customer's wallet in the order app (iruali import plan, feature 12):
 * add a gift card's balance to it, and pay an online order from it.
 *
 * The wallet pays an order only when it covers everything still due, so a
 * card payment that fails afterwards can never leave wallet money on an order
 * that is then cancelled.
 */
class CustomerWalletController extends Controller
{
    public function __construct(private readonly DepositLedgerService $ledger) {}

    /** POST /api/customer/wallet/gift-card {code}: the card's whole balance moves in; the card is used up. */
    public function addGiftCard(Request $request, GiftCardCodeService $codes, GiftCardRedemptionService $redemptions): JsonResponse
    {
        $customer = $this->customer($request);
        $validated = $request->validate(['code' => ['required', 'string', 'max:64']]);
        $actor = $this->systemActor();

        $moved = DB::transaction(function () use ($validated, $codes, $redemptions, $customer, $actor): int {
            $card = $codes->findActiveByCodeForUpdate($validated['code']);
            if ($card === null || $card->isExpired()) {
                abort(422, 'That gift card code is not valid, or it has expired or been used.');
            }
            if ($redemptions->reservedLaar($card) > 0) {
                abort(422, 'This card is being used on an order that is not paid yet. Try again after that order.');
            }
            $laar = $card->balanceLaar();
            if ($laar <= 0) {
                abort(422, 'This gift card has nothing left on it.');
            }
            $card->update(['current_balance' => 0, 'status' => 'depleted']);
            GiftCardTransaction::create([
                'gift_card_id' => $card->id,
                'amount' => -round($laar / 100, 2),
                'type' => 'redeem',
                'balance_after' => 0,
            ]);
            $this->ledger->creditFromGiftCard($customer, $laar, $actor, (string) $card->code_last4);

            return $laar;
        });

        return response()->json([
            'added_laar' => $moved,
            'balance_laar' => (int) CustomerDepositAccount::query()->where('customer_id', $customer->id)->value('balance_laar'),
            'message' => 'MVR ' . number_format($moved / 100, 2) . ' added to your wallet.',
        ]);
    }

    /** POST /api/customer/orders/{id}/pay-wallet: pay what is due from the wallet, when it covers all of it. */
    public function payOrder(Request $request, int $id, PaymentService $payments): JsonResponse
    {
        $customer = $this->customer($request);
        $order = Order::query()->findOrFail($id);
        abort_unless((int) $order->customer_id === (int) $customer->id, 403, 'Not your order.');
        if (in_array($order->status, ['paid', 'completed', 'cancelled'], true)) {
            abort(422, 'This order is already finished.');
        }
        $actor = $this->systemActor();

        DB::transaction(function () use ($order, $customer, $payments, $actor): void {
            $locked = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();
            $due = $payments->getRemainingBalanceLaar($locked);
            if ($due <= 0) {
                return;
            }
            // The family wallet (phase 4): their own while it has money, else the one shared with them.
            ['account' => $account] = app(\App\Domains\Deposits\Services\DepositEligibilityService::class)->spendingAccount($customer);
            $balance = $account !== null && $account->status === 'active'
                ? (int) $account->balance_laar - \App\Domains\Deposits\Support\DepositHolds::heldLaar((int) $account->customer_id)
                : 0;
            if ($balance < $due) {
                abort(422, 'Your wallet has MVR ' . number_format(max(0, $balance) / 100, 2) . '; this order needs MVR ' . number_format($due / 100, 2) . '. Pay by card instead.');
            }
            $payment = Payment::create([
                'order_id' => $locked->id,
                'method' => 'customer_deposit',
                'amount' => round($due / 100, 2),
                'amount_laar' => $due,
                'status' => 'paid',
                'processed_at' => now(),
                'idempotency_key' => 'wallet:' . $locked->id . ':' . $due,
            ]);
            $this->ledger->recordUsage($customer, $locked, $payment, $actor);
        });

        $fresh = $payments->completeZeroBalanceOnlineOrder($order->id, (int) $customer->id);

        return response()->json([
            'order' => ['id' => $fresh->id, 'status' => $fresh->status, 'payment_status' => $fresh->payment_status],
            'balance_laar' => (int) (app(\App\Domains\Deposits\Services\DepositEligibilityService::class)->spendingAccount($customer->fresh())['account']?->balance_laar ?? 0),
        ]);
    }

    /**
     * POST /api/customer/orders/{id}/hold-wallet (owner, 2026-10-21): the
     * wallet does not cover the order, so put what it has on hold and pay the
     * rest by card. Nothing leaves the wallet until the bank confirms the
     * card; a cancelled order frees it.
     */
    public function holdForOrder(Request $request, int $id, PaymentService $payments): JsonResponse
    {
        $customer = $this->customer($request);
        $order = Order::query()->findOrFail($id);
        abort_unless((int) $order->customer_id === (int) $customer->id, 403, 'Not your order.');
        if (in_array($order->status, ['paid', 'completed', 'cancelled'], true)) {
            abort(422, 'This order is already finished.');
        }

        $result = DB::transaction(function () use ($order, $customer, $payments): array {
            $locked = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();
            $held = \App\Domains\Deposits\Support\DepositHolds::heldOnOrderLaar($locked);
            // What is due with this order's own hold set aside, so a second
            // call sizes the hold afresh rather than on top of itself.
            $due = $payments->getRemainingBalanceLaar($locked) + $held;
            if ($due <= 0) {
                abort(422, 'Nothing is due on this order.');
            }
            // The family wallet (phase 4): their own while it has money, else the one shared with them.
            ['account' => $account] = app(\App\Domains\Deposits\Services\DepositEligibilityService::class)->spendingAccount($customer);
            if ($account === null || $account->status !== 'active') {
                abort(422, 'Your wallet cannot be used right now.');
            }
            $available = max(0, (int) $account->balance_laar - \App\Domains\Deposits\Support\DepositHolds::heldLaar((int) $account->customer_id));
            $available += $held;
            if ($available <= 0) {
                abort(422, 'Your wallet is empty.');
            }
            if ($available >= $due) {
                abort(422, 'Your wallet covers this order; pay it from the wallet instead.');
            }
            $hold = \App\Domains\Deposits\Support\DepositHolds::hold($customer, $locked, $available);

            return ['held_laar' => (int) $hold->amount_laar, 'remaining_laar' => $due - (int) $hold->amount_laar];
        });

        return response()->json($result);
    }

    /**
     * DELETE /api/customer/orders/{id}/hold-wallet: the customer unticked the
     * wallet before paying by card, so a hold from an earlier tap goes; the
     * card then pays the whole order.
     */
    public function releaseHold(Request $request, int $id): JsonResponse
    {
        $customer = $this->customer($request);
        $order = Order::query()->findOrFail($id);
        abort_unless((int) $order->customer_id === (int) $customer->id, 403, 'Not your order.');
        $released = $order->status === 'payment_pending'
            ? \App\Domains\Deposits\Support\DepositHolds::release($order)
            : 0;

        return response()->json(['released' => $released]);
    }

    private function customer(Request $request): Customer
    {
        $customer = $request->user();
        abort_unless($customer instanceof Customer, 403);

        return $customer;
    }

    /** Who the ledger names for a customer's own wallet action: the owner, as for gateway settlements. */
    private function systemActor(): User
    {
        return \App\Domains\Deposits\Support\WalletActor::system();
    }
}
