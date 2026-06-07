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
            'method' => ['required', 'in:cash,card,bank_transfer'],
            'reference' => ['nullable', 'string', 'max:200'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $amountLaar = isset($validated['amount_laar'])
            ? (int) $validated['amount_laar']
            : (int) round(((float) $validated['amount_mvr']) * 100);

        $ledger = $this->deposits->topUp(
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
            'ledger' => $this->formatLedgerRow($ledger),
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
            'ledger' => $this->formatLedgerRow($ledger),
            'deposit' => $this->formatDeposit($customer->fresh(), $account),
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
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function formatLedgerRow(CustomerDepositLedger $row): array
    {
        return [
            'id' => $row->id,
            'type' => $row->type,
            'amount_laar' => $row->amount_laar,
            'amount_mvr' => round($row->amount_laar / 100, 2),
            'balance_after_laar' => $row->balance_after_laar,
            'balance_after_mvr' => round($row->balance_after_laar / 100, 2),
            'order_id' => $row->order_id,
            'payment_id' => $row->payment_id,
            'shift_id' => $row->shift_id,
            'notes' => $row->notes,
            'created_at' => $row->created_at?->toIso8601String(),
        ];
    }
}
