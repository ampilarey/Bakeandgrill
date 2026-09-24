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
                && !$d->missing_charge_waived
                && !$d->missing_charge_forced
                && $missingQty > 0;

            // Wholesale audit, 2026-09-26: the resolve screen shows both
            // counts per line so the decision can set the billed quantity.
            $lines = $d->lines->map(fn ($line) => [
                'id' => $line->id,
                'item_name' => $line->item?->name ?? 'Item',
                'qty_sent' => (int) $line->qty_sent,
                'counted_return_qty' => (int) ($line->counted_return_qty ?? 0),
                'reported_sold_qty' => $line->reported_sold_qty !== null ? (int) $line->reported_sold_qty : null,
                'qty_sold' => (int) $line->qty_sold,
                'qty_missing' => (int) $line->qty_missing,
                'unit_price_laar' => (int) $line->unit_price_laar,
                'mismatch' => $line->reported_sold_qty !== null
                    && (int) $line->reported_sold_qty !== (int) $line->qty_sent - (int) ($line->counted_return_qty ?? 0),
            ])->values();

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
                'missing_policy' => $account->missing_policy,
                'missing_charge_waived' => (bool) $d->missing_charge_waived,
                'missing_charge_forced' => (bool) $d->missing_charge_forced,
                'self_reconciled' => (bool) $d->self_reconciled,
                'lines_count' => $d->lines->count(),
                'lines' => $lines,
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
            'lines' => ['nullable', 'array'],
            'lines.*.line_id' => ['required', 'integer'],
            'lines.*.sold_qty' => ['required', 'integer', 'min:0'],
        ]);

        $decisions = [];
        foreach ($validated['lines'] ?? [] as $row) {
            $decisions[(int) $row['line_id']] = (int) $row['sold_qty'];
        }

        $delivery = $this->invoices->resolveMismatch($delivery, $request->user(), $validated['decision'], $decisions);

        return response()->json([
            'delivery' => [
                'id' => $delivery->id,
                'delivery_number' => $delivery->delivery_number,
                'mismatch_blocking' => $delivery->mismatchIsBlocking(),
                'lines' => $delivery->lines->map(fn ($l) => ['id' => $l->id, 'qty_sold' => (int) $l->qty_sold, 'qty_missing' => (int) $l->qty_missing])->values(),
            ],
        ]);
    }

    public function chargeMissing(Request $request, int $id): JsonResponse
    {
        $delivery = TradeDelivery::findOrFail($id);
        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $delivery = $this->invoices->chargeMissing($delivery, $request->user(), $validated['reason']);

        return response()->json([
            'delivery' => [
                'id' => $delivery->id,
                'delivery_number' => $delivery->delivery_number,
                'missing_blocking' => false,
                'missing_charge_forced' => true,
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
                'credited_laar' => (int) ($inv->credited_laar ?? 0),
                'written_off_laar' => (int) ($inv->written_off_laar ?? 0),
                'balance_laar' => $balance,
                'status' => $inv->status,
                'display_status' => $inv->displayStatusLabel(),
                'is_overdue' => $overdue,
                'can_credit' => !in_array($inv->status, ['void', 'cancelled'], true) && (int) $inv->total_laar - (int) $inv->credited_laar > 0,
                'gst_period_key' => $inv->gst_period_key,
                'gst_period_differs_from_issue' => $inv->gstPeriodDiffersFromIssue(),
            ];
        });

        $ledger = CustomerCreditLedger::query()
            ->where('customer_id', $customer->id)
            ->orderBy('id')
            ->get();

        // A payment may have covered several invoices; the ledger row it
        // wrote remembers which (wholesale audit, 2026-09-26).
        $appliedByPayment = $ledger->whereNotNull('payment_id')->keyBy('payment_id');

        $paymentRows = Payment::query()
            ->whereIn('invoice_id', $invoices->pluck('id'))
            ->whereIn('status', ['confirmed', 'paid', 'completed'])
            ->orderByDesc('processed_at')
            ->get()
            ->map(function (Payment $p) use ($appliedByPayment) {
                $applied = $appliedByPayment->get($p->id)?->applied_invoices ?? [];
                $ids = array_values(array_unique(array_map(fn ($a) => (int) $a['invoice_id'], $applied)));

                return [
                    'id' => $p->id,
                    'amount_laar' => (int) $p->amount_laar,
                    'method' => $p->method,
                    'processed_at' => $p->processed_at?->toIso8601String() ?? $p->created_at?->toIso8601String(),
                    'reference_number' => $p->reference_number,
                    'invoice_ids' => $ids !== [] ? $ids : [$p->invoice_id],
                    'applied' => $applied,
                ];
            });

        $running = 0;
        $entries = $ledger->map(function (CustomerCreditLedger $row) use (&$running) {
            $running = (int) $row->balance_after_laar;
            $debit = $row->amount_laar > 0 ? (int) $row->amount_laar : 0;
            $credit = $row->amount_laar < 0 ? (int) abs($row->amount_laar) : 0;

            return [
                'id' => 'ledger-' . $row->id,
                'type' => match (true) {
                    $row->type === 'charge' => 'invoice',
                    $row->type === 'payment' => 'payment',
                    $row->method === 'credit_note' => 'credit_note',
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
                'credit_in_hand_laar' => $exposure->creditInHandLaar,
                'holding_unbilled_laar' => $exposure->holdingUnbilledLaar,
                'overdue_laar' => $overdueLaar,
                'account_active' => (bool) $account->is_active,
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
            'customer_id' => ['required', 'integer', 'in:' . $customer->id],
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
            'amount_laar' => ['nullable', 'integer', 'min:1'],
        ]);

        $cn = $this->invoices->createCreditNote(
            $invoice,
            $request->user(),
            $validated['credit_note_reason'],
            isset($validated['amount_laar']) ? (int) $validated['amount_laar'] : null,
        );

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
            'credited_laar' => (int) ($invoice->credited_laar ?? 0),
            'written_off_laar' => (int) ($invoice->written_off_laar ?? 0),
            'balance_laar' => $invoice->balanceDueLaar(),
            'display_status' => $invoice->displayStatusLabel(),
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
