<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Deposits\Services\CustomerDepositService;
use App\Models\Customer;
use App\Models\CustomerDepositLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class CustomerDepositController extends Controller
{
    public function __construct(
        private readonly CustomerDepositService $deposits,
    ) {}

    /**
     * GET /admin/customers/{id}/deposit
     */
    public function show(int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $account = $this->deposits->getOrCreateAccount($customer);

        $ledger = CustomerDepositLedger::query()
            ->with('order:id,order_number')
            ->where('customer_id', $customer->id)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get()
            ->map(fn (CustomerDepositLedger $row) => $this->formatLedgerRow($row));

        return response()->json([
            'deposit' => $this->formatDeposit($customer, $account),
            'ledger' => $ledger,
        ]);
    }

    /**
     * GET /admin/customers/{id}/deposit/ledger
     */
    public function ledger(Request $request, int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $perPage = min(100, max(10, (int) $request->query('per_page', 25)));

        $paginator = CustomerDepositLedger::query()
            ->with(['actor:id,name', 'order:id,order_number'])
            ->where('customer_id', $customer->id)
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return response()->json([
            'data' => collect($paginator->items())->map(fn (CustomerDepositLedger $row) => $this->formatLedgerRow($row, true)),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    /**
     * PATCH /admin/customers/{id}/deposit
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $actor = $request->user();
        abort_unless($actor !== null, 401);

        $validated = $request->validate([
            'action' => ['required', 'in:set_status'],
            'status' => ['required_if:action,set_status', 'in:active,frozen,closed'],
        ]);

        $account = match ($validated['action']) {
            'set_status' => $this->deposits->setStatus(
                $customer,
                (string) $validated['status'],
                $actor,
                $request,
            ),
        };

        return response()->json(['deposit' => $this->formatDeposit($customer, $account)]);
    }

    /**
     * POST /admin/customers/{id}/deposit/top-up
     */
    public function topUp(Request $request, int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $actor = $request->user();
        abort_unless($actor !== null, 401);

        $validated = $request->validate([
            'amount_laar' => ['nullable', 'integer', 'min:1'],
            'amount_mvr' => ['nullable', 'numeric', 'min:0.01'],
            'method' => ['required', 'in:cash,card,bank_transfer,online,bml'],
            'reference' => ['nullable', 'string', 'max:200'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $amountLaar = isset($validated['amount_laar'])
            ? (int) $validated['amount_laar']
            : (int) round(((float) $validated['amount_mvr']) * 100);

        $ledger = $this->deposits->receiveDeposit(
            $customer,
            $amountLaar,
            $validated['method'],
            $actor,
            $validated['reference'] ?? null,
            $validated['notes'] ?? null,
            $request,
        );

        $account = $this->deposits->getOrCreateAccount($customer->fresh());

        return response()->json([
            'ledger' => $this->formatLedgerRow($ledger, true),
            'deposit' => $this->formatDeposit($customer->fresh(), $account),
        ], 201);
    }

    /**
     * POST /admin/customers/{id}/deposit/adjust
     */
    public function adjust(Request $request, int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $actor = $request->user();
        abort_unless($actor !== null, 401);

        $validated = $request->validate([
            'amount_laar' => ['required', 'integer', 'not_in:0'],
            'notes' => ['required', 'string', 'max:2000'],
        ]);

        $ledger = $this->deposits->adjust(
            $customer,
            (int) $validated['amount_laar'],
            $actor,
            $validated['notes'],
            $request,
        );

        $account = $this->deposits->getOrCreateAccount($customer->fresh());

        return response()->json([
            'ledger' => $this->formatLedgerRow($ledger, true),
            'deposit' => $this->formatDeposit($customer->fresh(), $account),
        ], 201);
    }

    /**
     * POST /admin/customers/{id}/deposit/refund
     */
    public function refund(Request $request, int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $actor = $request->user();
        abort_unless($actor !== null, 401);

        $validated = $request->validate([
            'amount_laar' => ['nullable', 'integer', 'min:1'],
            'amount_mvr' => ['nullable', 'numeric', 'min:0.01'],
            'method' => ['required', 'in:cash,card,bank_transfer'],
            'reference' => ['nullable', 'string', 'max:200'],
            'reason' => ['required', 'string', 'max:2000'],
        ]);

        $amountLaar = isset($validated['amount_laar'])
            ? (int) $validated['amount_laar']
            : (int) round(((float) $validated['amount_mvr']) * 100);

        $ledger = $this->deposits->payoutDeposit(
            $customer,
            $amountLaar,
            $validated['method'],
            $actor,
            $validated['reference'] ?? null,
            $validated['reason'],
            $request,
        );

        $account = $this->deposits->getOrCreateAccount($customer->fresh());

        return response()->json([
            'ledger' => $this->formatLedgerRow($ledger, true),
            'deposit' => $this->formatDeposit($customer->fresh(), $account),
        ], 201);
    }

    /**
     * POST /admin/customers/{id}/deposit/transfer-to-credit
     */
    public function transferToCredit(Request $request, int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $actor = $request->user();
        abort_unless($actor !== null, 401);

        $validated = $request->validate([
            'amount_laar' => ['nullable', 'integer', 'min:1'],
            'amount_mvr' => ['nullable', 'numeric', 'min:0.01'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $amountLaar = isset($validated['amount_laar'])
            ? (int) $validated['amount_laar']
            : (int) round(((float) $validated['amount_mvr']) * 100);

        $result = $this->deposits->transferToCredit(
            $customer,
            $amountLaar,
            $actor,
            $validated['notes'] ?? null,
            $request,
        );

        $account = $this->deposits->getOrCreateAccount($customer->fresh());

        return response()->json([
            'amount_laar' => $result['amount_laar'],
            'deposit_ledger' => $this->formatLedgerRow($result['deposit_ledger'], true),
            'deposit' => $this->formatDeposit($customer->fresh(), $account),
            'credit_balance_laar' => (int) $customer->fresh()->credit_balance_laar,
        ], 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function formatDeposit(Customer $customer, \App\Models\CustomerDepositAccount $account): array
    {
        $summary = $this->deposits->depositSummary($customer, $account);

        return array_merge($summary, [
            'customer_id' => $customer->id,
            'balance_mvr' => round($summary['balance_laar'] / 100, 2),
            'total_received_mvr' => round(($summary['total_received_laar'] ?? 0) / 100, 2),
            'total_used_mvr' => round(($summary['total_used_laar'] ?? 0) / 100, 2),
            'credit_balance_laar' => (int) $customer->credit_balance_laar,
            'credit_balance_mvr' => round((int) $customer->credit_balance_laar / 100, 2),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function formatLedgerRow(CustomerDepositLedger $row, bool $includeActor = false): array
    {
        $row->loadMissing('order:id,order_number');

        $data = [
            'id' => $row->id,
            'type' => $row->type,
            'method' => $row->method,
            'amount_laar' => $row->amount_laar,
            'amount_mvr' => round($row->amount_laar / 100, 2),
            'balance_before_laar' => $row->balance_before_laar,
            'balance_after_laar' => $row->balance_after_laar,
            'balance_after_mvr' => round($row->balance_after_laar / 100, 2),
            'order_id' => $row->order_id,
            'order_number' => $row->order?->order_number,
            'payment_id' => $row->payment_id,
            'refund_id' => $row->refund_id,
            'shift_id' => $row->shift_id,
            'reference' => $row->reference,
            'created_at' => $row->created_at?->toIso8601String(),
        ];

        if ($includeActor) {
            $data['actor_name'] = $row->actor?->name;
            $data['notes'] = $row->notes;
        }

        return $data;
    }
}
