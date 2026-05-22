<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Customers\Services\CustomerCreditService;
use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class CustomerCreditController extends Controller
{
    public function __construct(
        private readonly CustomerCreditService $credit,
    ) {}

    /**
     * GET /admin/customers/{id}/credit
     */
    public function show(int $id): JsonResponse
    {
        $customer = Customer::with('creditApprovedBy:id,name')->findOrFail($id);

        $ledger = CustomerCreditLedger::query()
            ->where('customer_id', $customer->id)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get()
            ->map(fn (CustomerCreditLedger $row) => $this->formatLedgerRow($row));

        return response()->json([
            'credit' => $this->formatCredit($customer),
            'ledger' => $ledger,
            'open_invoices' => $this->credit->openCreditInvoices($customer),
        ]);
    }

    /**
     * PATCH /admin/customers/{id}/credit
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $actor = $request->user();
        abort_unless($actor !== null, 401);

        $validated = $request->validate([
            'action' => ['required', 'in:approve,disable,update_limit,set_status'],
            'credit_limit_laar' => ['nullable', 'integer', 'min:0'],
            'credit_limit_mvr' => ['nullable', 'numeric', 'min:0'],
            'credit_notes' => ['nullable', 'string', 'max:2000'],
            'credit_status' => ['nullable', 'in:active,on_hold,blocked'],
            'override_limit' => ['sometimes', 'boolean'],
        ]);

        $limitLaar = isset($validated['credit_limit_laar'])
            ? (int) $validated['credit_limit_laar']
            : (int) round(((float) ($validated['credit_limit_mvr'] ?? 0)) * 100);

        $updated = match ($validated['action']) {
            'approve' => $this->credit->approveCredit(
                $customer,
                $limitLaar,
                $actor,
                $validated['credit_notes'] ?? null,
                $request,
            ),
            'disable' => $this->credit->disableCredit($customer, $actor, $request),
            'update_limit' => $this->credit->updateLimit(
                $customer,
                $limitLaar,
                $actor,
                (bool) ($validated['override_limit'] ?? false),
                $request,
            ),
            'set_status' => $this->credit->setStatus(
                $customer,
                (string) ($validated['credit_status'] ?? 'blocked'),
                $actor,
                $request,
            ),
        };

        return response()->json(['customer' => $this->formatCredit($updated)]);
    }

    /**
     * GET /admin/customers/{id}/credit/invoices
     */
    public function invoices(int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);

        return response()->json([
            'invoices' => $this->credit->openCreditInvoices($customer),
        ]);
    }

    /**
     * GET /admin/customers/{id}/credit/ledger
     */
    public function ledger(Request $request, int $id): JsonResponse
    {
        Customer::findOrFail($id);

        $paginator = CustomerCreditLedger::query()
            ->where('customer_id', $id)
            ->orderByDesc('created_at')
            ->paginate(30);

        return response()->json([
            'data' => collect($paginator->items())->map(fn (CustomerCreditLedger $row) => $this->formatLedgerRow($row)),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    /**
     * POST /admin/customers/{id}/credit/repayments
     */
    public function repay(Request $request, int $id): JsonResponse
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
            'invoice_ids' => ['nullable', 'array'],
            'invoice_ids.*' => ['integer', 'exists:invoices,id'],
        ]);

        $amountLaar = isset($validated['amount_laar'])
            ? (int) $validated['amount_laar']
            : (int) round(((float) $validated['amount_mvr']) * 100);

        $ledger = $this->credit->recordRepayment(
            $customer,
            $amountLaar,
            $validated['method'],
            $actor,
            $validated['invoice_ids'] ?? null,
            $validated['reference'] ?? null,
            $validated['notes'] ?? null,
            $request,
        );

        $customer->refresh();

        return response()->json([
            'ledger' => $this->formatLedgerRow($ledger),
            'credit' => $this->formatCredit($customer->load('creditApprovedBy:id,name')),
        ], 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function formatCredit(Customer $customer): array
    {
        $summary = $this->credit->creditSummary($customer);

        return array_merge($summary, [
            'customer_id' => $customer->id,
            'approved_by_name' => $customer->creditApprovedBy?->name,
            'limit_mvr' => round($summary['limit_laar'] / 100, 2),
            'balance_mvr' => round($summary['balance_laar'] / 100, 2),
            'available_mvr' => round($summary['available_laar'] / 100, 2),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function formatLedgerRow(CustomerCreditLedger $row): array
    {
        return [
            'id' => $row->id,
            'type' => $row->type,
            'amount_laar' => $row->amount_laar,
            'amount_mvr' => round($row->amount_laar / 100, 2),
            'balance_after_laar' => $row->balance_after_laar,
            'balance_after_mvr' => round($row->balance_after_laar / 100, 2),
            'order_id' => $row->order_id,
            'invoice_id' => $row->invoice_id,
            'payment_id' => $row->payment_id,
            'shift_id' => $row->shift_id,
            'method' => $row->method,
            'notes' => $row->notes,
            'created_at' => $row->created_at?->toIso8601String(),
        ];
    }
}
