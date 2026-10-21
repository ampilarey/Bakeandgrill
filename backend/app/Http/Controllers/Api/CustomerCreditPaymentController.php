<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Credit\Services\CreditEligibilityService;
use App\Domains\Credit\Services\CreditPaymentService;
use App\Domains\Credit\Services\CreditPolicy;
use App\Domains\Credit\Services\CustomerCreditService;
use App\Domains\Deposits\Support\DepositHolds;
use App\Domains\Deposits\Support\WalletActor;
use App\Domains\Payments\Services\PaymentService;
use App\Http\Controllers\Controller;
use App\Models\CreditPayment;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The credit account paid online from the order app (owner, 2026-10-21):
 * the statement (balance, overdue, every open invoice, the statement page),
 * Pay now for the whole balance or part of it, and how a payment went when
 * the bank brings them back.
 */
class CustomerCreditPaymentController extends Controller
{
    public function __construct(private readonly CreditPaymentService $credit) {}

    /** GET /api/customer/credit/statement */
    public function statement(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        if (!$customer->credit_enabled && (int) $customer->credit_balance_laar <= 0) {
            return response()->json(['statement' => null]);
        }

        return response()->json(['statement' => $this->present($this->credit->statement($customer))]);
    }

    /** POST /api/customer/credit/pay {amount_laar?}: the whole balance unless an amount is given. */
    public function start(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        $validated = $request->validate([
            'amount_laar' => ['nullable', 'integer', 'min:1'],
            'amount_mvr' => ['nullable', 'numeric', 'min:0.01'],
        ]);
        $amountLaar = isset($validated['amount_laar'])
            ? (int) $validated['amount_laar']
            : (isset($validated['amount_mvr']) ? (int) round(((float) $validated['amount_mvr']) * 100) : null);

        $result = $this->credit->startFromApp($customer, $amountLaar);

        return response()->json([
            'credit_payment' => $this->presentPayment($result['credit_payment']),
            'payment_url' => $result['payment_url'],
        ], 201);
    }

    /**
     * POST /api/customer/orders/{id}/pay-credit (phase 4, owner 2026-10-21):
     * an online order charged to the customer's credit account, as a till
     * sale on account is. The invoice is raised, the "charged" text goes
     * with the order's confirmation, and the kitchen gets the order at once.
     */
    public function payOrder(
        Request $request,
        int $id,
        PaymentService $payments,
        CreditEligibilityService $eligibility,
        CustomerCreditService $credit,
    ): JsonResponse {
        $customer = $this->customer($request);
        $order = Order::query()->findOrFail($id);
        abort_unless((int) $order->customer_id === (int) $customer->id, 403, 'Not your order.');
        if (in_array($order->status, ['paid', 'completed', 'cancelled'], true) || $order->payment_status === 'paid' || $payments->getRemainingBalanceLaar($order) <= 0) {
            abort(422, 'This order is already paid.');
        }
        if (!CreditPolicy::onlineOrdersEnabled()) {
            abort(422, 'Orders on account are not available online right now. Pay by card.');
        }

        DB::transaction(function () use ($order, $customer, $payments, $eligibility, $credit, $request): void {
            $locked = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();
            // A wallet hold from an earlier tap is not wanted: the account takes it all.
            DepositHolds::release($locked);
            $due = $payments->getRemainingBalanceLaar($locked);
            if ($due <= 0) {
                return;
            }
            $fresh = $customer->fresh();
            $eligibility->assertCanCharge($fresh, $due);
            $payment = Payment::create([
                'order_id' => $locked->id,
                'method' => 'house_account',
                'amount' => round($due / 100, 2),
                'amount_laar' => $due,
                'status' => 'paid',
                'processed_at' => now(),
                'idempotency_key' => 'credit:order:' . $locked->id . ':' . $due,
            ]);
            $credit->recordCharge($fresh, $locked, $payment, WalletActor::system(), $request);
        });

        $fresh = $payments->completeZeroBalanceOnlineOrder($order->id, (int) $customer->id);

        return response()->json([
            'order' => ['id' => $fresh->id, 'status' => $fresh->status, 'payment_status' => $fresh->payment_status],
            'credit' => $credit->customerFacingSummary($customer->fresh()),
        ]);
    }

    /** GET /api/customer/credit/payments/{token}: asks the bank while it is pending. */
    public function show(Request $request, string $token): JsonResponse
    {
        $customer = $this->customer($request);
        $row = CreditPayment::query()->where('token', $token)->where('customer_id', $customer->id)->firstOrFail();
        if ($row->status === CreditPayment::STATUS_PENDING) {
            $this->credit->heal($row);
            $row = $this->credit->expireIfDue($row->fresh());
        }

        return response()->json([
            'credit_payment' => $this->presentPayment($row),
            'balance_mvr' => round(max(0, (int) ($customer->fresh()?->credit_balance_laar ?? 0)) / 100, 2),
        ]);
    }

    /**
     * @param array<string, mixed> $s
     * @return array<string, mixed>
     */
    private function present(array $s): array
    {
        return [
            'enabled' => $s['enabled'],
            'status' => $s['status'],
            'balance_mvr' => round($s['balance_laar'] / 100, 2),
            'available_mvr' => round($s['available_laar'] / 100, 2),
            'limit_mvr' => round($s['limit_laar'] / 100, 2),
            'overdue_mvr' => round($s['overdue_laar'] / 100, 2),
            'next_due_date' => $s['next_due_date'],
            'payment_terms_days' => $s['payment_terms_days'],
            'invoices' => array_map(fn (array $i) => [
                'id' => $i['id'],
                'invoice_number' => $i['invoice_number'],
                'order_id' => $i['order_id'],
                'issue_date' => $i['issue_date'],
                'due_date' => $i['due_date'],
                'overdue' => $i['overdue'],
                'days_overdue' => $i['days_overdue'],
                'total_mvr' => round($i['total_laar'] / 100, 2),
                'balance_due_mvr' => round($i['balance_due_laar'] / 100, 2),
                'view_url' => $i['view_url'],
            ], $s['invoices']),
            'statement_url' => $s['statement_url'],
            'can_pay_online' => $s['can_pay_online'],
        ];
    }

    /** @return array<string, mixed> */
    private function presentPayment(CreditPayment $row): array
    {
        $row->loadMissing('ledger');

        return [
            'token' => $row->token,
            'number' => $row->number(),
            'status' => $row->status,
            'amount_mvr' => round($row->amount_laar / 100, 2),
            'balance_after_mvr' => $row->ledger !== null ? round(max(0, (int) $row->ledger->balance_after_laar) / 100, 2) : null,
            'paid_at' => $row->paid_at?->toIso8601String(),
            'expires_at' => $row->expires_at?->toIso8601String(),
        ];
    }

    private function customer(Request $request): Customer
    {
        $customer = $request->user();
        abort_unless($customer instanceof Customer, 403, 'Forbidden — customer access only.');

        return $customer;
    }
}
