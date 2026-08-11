<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Trade\Services\TradeCreditExposureService;
use App\Domains\Trade\Services\TradeInvoiceService;
use App\Domains\Trade\Services\TradeReceivablePaymentService;
use App\Models\CustomerCreditLedger;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use App\Models\TradeInvoiceAllocation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class TradeInvoiceController extends Controller
{
    public function __construct(
        private readonly TradeInvoiceService $invoices,
        private readonly TradeReceivablePaymentService $payments,
        private readonly TradeCreditExposureService $exposure,
    ) {}

    public function readyToInvoice(int $id): JsonResponse
    {
        $account = TradeAccount::with('customer')->findOrFail($id);

        $deliveries = TradeDelivery::query()
            ->where('trade_account_id', $account->id)
            ->where('status', TradeDelivery::STATUS_RECONCILED)
            ->with(['lines.item'])
            ->orderBy('reconciled_at')
            ->get();

        $data = $deliveries->map(function (TradeDelivery $d) use ($account) {
            $invoiceableLaar = 0;
            $missingQty = 0;
            foreach ($d->lines as $line) {
                // Parent delivery is already in hand — avoid lazy-load / N+1.
                $line->setRelation('delivery', $d);
                $cap = $this->exposure->invoiceableQty($line, $account);
                $left = max(0, $cap - $this->exposure->allocatedQty($line->id));
                $invoiceableLaar += $left * (int) $line->unit_price_laar;
                $missingQty += (int) $line->qty_missing;
            }

            $missingBlocking = $account->missing_policy === TradeAccount::MISSING_DISPUTE
                && ! $d->missing_charge_waived
                && $missingQty > 0;

            return [
                'id' => $d->id,
                'delivery_number' => $d->delivery_number,
                'status' => $d->status,
                'reconciled_at' => $d->reconciled_at?->toIso8601String(),
                'stamped_value_laar' => $d->stampedValueLaar(),
                'invoiceable_laar' => $invoiceableLaar,
                'has_mismatch' => (bool) $d->has_mismatch,
                'mismatch_blocking' => $d->mismatchIsBlocking(),
                'missing_qty' => $missingQty,
                'missing_blocking' => $missingBlocking,
                'self_reconciled' => (bool) $d->self_reconciled,
                'lines_count' => $d->lines->count(),
            ];
        })->filter(fn (array $row) => $row['invoiceable_laar'] > 0 || $row['mismatch_blocking'] || $row['missing_blocking'])
            ->values();

        return response()->json(['data' => $data]);
    }

    public function preview(Request $request, int $id): JsonResponse
    {
        $account = TradeAccount::findOrFail($id);
        $validated = $request->validate([
            'delivery_ids' => ['required', 'array', 'min:1'],
            'delivery_ids.*' => ['integer'],
        ]);

        $preview = $this->invoices->preview($account, array_map('intval', $validated['delivery_ids']));
        $preview['total_mvr'] = number_format($preview['total_laar'] / 100, 2, '.', '');

        return response()->json(['preview' => $preview]);
    }

    public function store(Request $request, int $id): JsonResponse
    {
        $account = TradeAccount::with('customer')->findOrFail($id);
        $validated = $request->validate([
            'delivery_ids' => ['required', 'array', 'min:1'],
            'delivery_ids.*' => ['integer'],
            'idempotency_key' => ['required', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $invoice = $this->invoices->raise(
            $account,
            array_map('intval', $validated['delivery_ids']),
            $request->user(),
            $validated['idempotency_key'],
            $validated['notes'] ?? null,
        );

        return response()->json(['invoice' => $this->formatInvoice($invoice)], 201);
    }

    public function resolveMismatch(Request $request, int $id): JsonResponse
    {
        $delivery = TradeDelivery::findOrFail($id);
        $validated = $request->validate([
            'decision' => ['required', 'string', 'max:2000'],
        ]);

        $delivery = $this->invoices->resolveMismatch($delivery, $request->user(), $validated['decision']);

        return response()->json([
            'delivery' => [
                'id' => $delivery->id,
                'delivery_number' => $delivery->delivery_number,
                'mismatch_blocking' => $delivery->mismatchIsBlocking(),
            ],
        ]);
    }

    public function waiveMissing(Request $request, int $id): JsonResponse
    {
        $delivery = TradeDelivery::findOrFail($id);
        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:2000'],
        ]);

        $delivery = $this->invoices->waiveMissingCharge($delivery, $request->user(), $validated['reason']);

        return response()->json([
            'delivery' => [
                'id' => $delivery->id,
                'delivery_number' => $delivery->delivery_number,
                'missing_blocking' => false,
            ],
        ]);
    }

    public function statement(int $id): JsonResponse
    {
        $account = TradeAccount::with('customer')->findOrFail($id);
        $customer = $account->customer;
        abort_if($customer === null, 422, 'Trade account has no customer.');

        $exposure = $this->exposure->forCustomer($customer);

        $invoices = Invoice::query()
            ->where('trade_account_id', $account->id)
            ->where('type', 'sale')
            ->orderBy('issue_date')
            ->get();

        $invoiceRows = $invoices->map(function (Invoice $inv) {
            $balance = $inv->balanceDueLaar();
            $due = $inv->due_date;
            $overdue = $balance > 0 && $due && $due->isPast() && $inv->status !== 'paid';

            return [
                'id' => $inv->id,
                'invoice_number' => $inv->invoice_number,
                'issue_date' => $inv->issue_date?->toDateString(),
                'due_date' => $inv->due_date?->toDateString(),
                'total_laar' => (int) $inv->total_laar,
                'amount_paid_laar' => (int) ($inv->amount_paid_laar ?? 0),
                'balance_laar' => $balance,
                'status' => $inv->status,
                'is_overdue' => $overdue,
                'gst_period_key' => $inv->gst_period_key,
                'gst_period_differs_from_issue' => $inv->gstPeriodDiffersFromIssue(),
            ];
        });

        $paymentRows = Payment::query()
            ->whereIn('invoice_id', $invoices->pluck('id'))
            ->whereIn('status', ['confirmed', 'paid', 'completed'])
            ->orderByDesc('processed_at')
            ->get()
            ->map(fn (Payment $p) => [
                'id' => $p->id,
                'amount_laar' => (int) $p->amount_laar,
                'method' => $p->method,
                'processed_at' => $p->processed_at?->toIso8601String() ?? $p->created_at?->toIso8601String(),
                'reference_number' => $p->reference_number,
                'invoice_ids' => [$p->invoice_id],
            ]);

        $ledger = CustomerCreditLedger::query()
            ->where('customer_id', $customer->id)
            ->orderBy('id')
            ->get();

        $running = 0;
        $entries = $ledger->map(function (CustomerCreditLedger $row) use (&$running) {
            $running = (int) $row->balance_after_laar;
            $debit = $row->amount_laar > 0 ? (int) $row->amount_laar : 0;
            $credit = $row->amount_laar < 0 ? (int) abs($row->amount_laar) : 0;

            return [
                'id' => 'ledger-'.$row->id,
                'type' => match ($row->type) {
                    'charge' => 'invoice',
                    'payment' => 'payment',
                    default => 'adjustment',
                },
                'date' => $row->created_at?->toDateString(),
                'description' => $row->notes ?? $row->type,
                'debit_laar' => $debit,
                'credit_laar' => $credit,
                'running_balance_laar' => $running,
                'invoice_id' => $row->invoice_id,
                'payment_id' => $row->payment_id,
            ];
        });

        $overdueLaar = $invoiceRows->where('is_overdue', true)->sum('balance_laar');

        return response()->json([
            'statement' => [
                'exposure' => $exposure->toArray(),
                'balance_owed_laar' => $exposure->balanceOwedLaar,
                'holding_unbilled_laar' => $exposure->holdingUnbilledLaar,
                'overdue_laar' => $overdueLaar,
                'invoices' => $invoiceRows->values(),
                'payments' => $paymentRows->values(),
                'entries' => $entries->values(),
            ],
        ]);
    }

    public function recordPayment(Request $request, int $id): JsonResponse
    {
        $account = TradeAccount::with('customer')->findOrFail($id);
        $customer = $account->customer;
        abort_if($customer === null, 422, 'Trade account has no customer.');

        $validated = $request->validate([
            'customer_id' => ['required', 'integer', 'in:'.$customer->id],
            'amount_laar' => ['required', 'integer', 'min:1'],
            'method' => ['required', 'in:cash,card,bank_transfer'],
            'idempotency_key' => ['required', 'string', 'max:120'],
            'invoice_ids' => ['nullable', 'array'],
            'invoice_ids.*' => ['integer'],
            'reference' => ['nullable', 'string', 'max:200'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $result = $this->payments->record(
            $customer,
            (int) $validated['amount_laar'],
            $validated['method'],
            $request->user(),
            $validated['idempotency_key'],
            isset($validated['invoice_ids']) ? array_map('intval', $validated['invoice_ids']) : null,
            $validated['reference'] ?? null,
            $validated['notes'] ?? null,
        );

        $statement = json_decode($this->statement($id)->getContent(), true)['statement'] ?? null;

        return response()->json([
            'payment' => [
                'id' => $result['payment']->id,
                'amount_laar' => (int) $result['payment']->amount_laar,
            ],
            'statement' => $statement,
        ], 201);
    }

    public function creditNote(Request $request, int $id): JsonResponse
    {
        $invoice = Invoice::findOrFail($id);
        $validated = $request->validate([
            'credit_note_reason' => ['required', 'string', 'max:500'],
        ]);

        $cn = $this->invoices->createCreditNote($invoice, $request->user(), $validated['credit_note_reason']);

        return response()->json([
            'credit_note' => $this->formatInvoice($cn),
            'invoice' => $this->formatInvoice($invoice->fresh()),
        ], 201);
    }

    /** @return array<string, mixed> */
    private function formatInvoice(Invoice $invoice): array
    {
        return [
            'id' => $invoice->id,
            'invoice_number' => $invoice->invoice_number,
            'status' => $invoice->status,
            'total_laar' => (int) $invoice->total_laar,
            'total' => (float) $invoice->total,
            'amount_paid_laar' => (int) ($invoice->amount_paid_laar ?? 0),
            'balance_laar' => $invoice->balanceDueLaar(),
            'issue_date' => $invoice->issue_date?->toDateString(),
            'due_date' => $invoice->due_date?->toDateString(),
            'gst_period_key' => $invoice->gst_period_key,
            'gst_ledger_date' => $invoice->gst_ledger_date?->toDateString(),
            'gst_period_differs_from_issue' => $invoice->gstPeriodDiffersFromIssue(),
            'recipient_phone' => $invoice->recipient_phone,
            'customer_id' => $invoice->customer_id,
            'trade_account_id' => $invoice->trade_account_id,
            'notes' => $invoice->notes,
            'items' => $invoice->relationLoaded('items')
                ? $invoice->items->map(fn ($i) => [
                    'description' => $i->description,
                    'quantity' => $i->quantity,
                    'unit_price_laar' => $i->unit_price_laar,
                    'total_laar' => $i->total_laar,
                ])->values()
                : null,
            'allocation_count' => TradeInvoiceAllocation::where('invoice_id', $invoice->id)->count(),
        ];
    }
}
