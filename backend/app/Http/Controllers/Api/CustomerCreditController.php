<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Credit\Services\CreditPolicy;
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
            'action' => ['required', 'in:approve,disable,update_limit,set_status,update_terms,set_reminder_sms'],
            'credit_limit_laar' => ['nullable', 'integer', 'min:0'],
            'credit_limit_mvr' => ['nullable', 'numeric', 'min:0'],
            'credit_notes' => ['nullable', 'string', 'max:2000'],
            'credit_status' => ['nullable', 'in:active,on_hold,blocked'],
            'credit_payment_terms_days' => ['nullable', 'required_if:action,update_terms', 'integer', 'min:7', 'max:90'],
            'credit_reminder_sms' => ['nullable', 'boolean'],
            'override_limit' => ['sometimes', 'boolean'],
            // FIX 6: reason is REQUIRED for update_limit and REQUIRED
            // whenever the limit exceeds credit_limit_max_mvr (checked
            // inside the service so the same rule applies to approve/update).
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $limitMvrRaw = $validated['credit_limit_mvr'] ?? null;
        if ($limitMvrRaw !== null && (!is_numeric($limitMvrRaw) || !is_finite((float) $limitMvrRaw))) {
            abort(422, 'Credit limit is not a valid number.');
        }
        $limitLaar = isset($validated['credit_limit_laar'])
            ? (int) $validated['credit_limit_laar']
            : (int) round(((float) ($limitMvrRaw ?? 0)) * 100);

        $updated = match ($validated['action']) {
            'approve' => $this->credit->approveCredit(
                $customer,
                $limitLaar,
                $actor,
                $validated['credit_notes'] ?? null,
                $request,
                isset($validated['credit_payment_terms_days'])
                    ? (int) $validated['credit_payment_terms_days']
                    : null,
                $validated['reason'] ?? null,
            ),
            'disable' => $this->credit->disableCredit($customer, $actor, $request),
            'update_limit' => $this->credit->updateLimit(
                $customer,
                $limitLaar,
                $actor,
                (bool) ($validated['override_limit'] ?? false),
                $request,
                $validated['reason'] ?? null,
            ),
            'set_status' => $this->credit->setStatus(
                $customer,
                (string) ($validated['credit_status'] ?? 'blocked'),
                $actor,
                $request,
            ),
            'update_terms' => $this->credit->updatePaymentTerms(
                $customer,
                (int) $validated['credit_payment_terms_days'],
                $actor,
                $request,
            ),
            'set_reminder_sms' => $this->credit->setReminderSms(
                $customer,
                (bool) $validated['credit_reminder_sms'],
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
     * POST /admin/customers/{id}/credit/write-off — FIX 9a.
     */
    public function writeOff(Request $request, int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $actor = $request->user();
        abort_unless($actor !== null, 401);

        $validated = $request->validate([
            'amount_laar' => ['nullable', 'integer', 'min:1'],
            'amount_mvr' => ['nullable', 'numeric', 'min:0.01'],
            'reason' => ['required', 'string', 'min:5', 'max:1000'],
        ]);

        $amountLaar = isset($validated['amount_laar'])
            ? (int) $validated['amount_laar']
            : (int) round(((float) $validated['amount_mvr']) * 100);

        $ledger = $this->credit->writeOff(
            $customer,
            $amountLaar,
            $actor,
            (string) $validated['reason'],
            $request,
        );

        $customer->refresh();

        return response()->json([
            'ledger' => $this->formatLedgerRow($ledger),
            'credit' => $this->formatCredit($customer->load('creditApprovedBy:id,name')),
        ], 201);
    }

    /**
     * GET /admin/customers/{id}/credit/ledger.csv — FIX 9b.
     */
    public function ledgerCsv(int $id)
    {
        Customer::findOrFail($id);

        $rows = CustomerCreditLedger::query()
            ->where('customer_id', $id)
            ->orderByDesc('created_at')
            ->limit(5000)
            ->get();

        $headers = [
            'id', 'created_at', 'type', 'method',
            'amount_mvr', 'balance_after_mvr',
            'order_id', 'invoice_id', 'payment_id', 'shift_id',
            'notes',
        ];

        return $this->csvResponse('credit-ledger-' . $id . '.csv', $headers, $rows, function (CustomerCreditLedger $row): array {
            return [
                $row->id,
                $row->created_at?->toIso8601String(),
                $row->type,
                $row->method,
                round(((int) $row->amount_laar) / 100, 2),
                round(((int) $row->balance_after_laar) / 100, 2),
                $row->order_id,
                $row->invoice_id,
                $row->payment_id,
                $row->shift_id,
                (string) ($row->notes ?? ''),
            ];
        });
    }

    /**
     * @param iterable<mixed> $rows
     */
    private function csvResponse(string $filename, array $headers, iterable $rows, callable $mapper)
    {
        $handle = fopen('php://temp', 'r+');
        fputcsv($handle, $headers);
        foreach ($rows as $row) {
            $line = $mapper($row);
            $sanitized = array_map(function ($v) {
                if ($v === null) {
                    return '';
                }
                if (is_numeric($v)) {
                    return (string) $v;
                }
                $s = (string) $v;
                if (preg_match('/^[=+\-@]/', $s)) {
                    return "'" . $s;
                }

                return $s;
            }, $line);
            fputcsv($handle, $sanitized);
        }
        rewind($handle);
        $csv = stream_get_contents($handle);
        fclose($handle);

        return response($csv, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function formatCredit(Customer $customer): array
    {
        $summary = $this->credit->creditSummary($customer);
        $maxLaar = \App\Domains\Credit\Services\CreditLedgerService::creditLimitMaxLaar();

        return array_merge($summary, [
            'customer_id' => $customer->id,
            'approved_by_name' => $customer->creditApprovedBy?->name,
            'limit_mvr' => round($summary['limit_laar'] / 100, 2),
            'balance_mvr' => round($summary['balance_laar'] / 100, 2),
            'available_mvr' => round($summary['available_laar'] / 100, 2),
            'limit_max_laar' => $maxLaar,
            'limit_max_mvr' => round($maxLaar / 100, 2),
            // F6: a blocked or disabled account can still owe money. Say so,
            // rather than leaving the debt to be discovered in a report.
            'outstanding_balance_mvr' => round($summary['balance_laar'] / 100, 2),
            'has_outstanding_balance' => $summary['balance_laar'] > 0,
            // F1/F4/F7: the house policy the admin screen edits.
            'policy' => [
                'mode' => CreditPolicy::mode(),
                'accepts_new_accounts' => CreditPolicy::acceptsNewAccounts(),
                'accepts_new_charges' => CreditPolicy::acceptsNewCharges(),
                'default_payment_terms_days' => CreditPolicy::defaultPaymentTermsDays(),
            ],
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
