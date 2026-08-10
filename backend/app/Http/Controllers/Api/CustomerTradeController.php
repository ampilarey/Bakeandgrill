<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Payments\Services\PaymentService;
use App\Domains\Trade\Services\TradeSalesReportService;
use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use App\Models\TradeDeliveryLine;
use App\Domains\System\Services\ServiceAvailabilityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Stage E — shop-facing wholesale screens (customer.token).
 * Ownership always from the authenticated customer — never from a request id.
 */
class CustomerTradeController extends Controller
{
    public function __construct(
        private readonly TradeSalesReportService $reports,
        private readonly PaymentService $payments,
    ) {}

    public function deliveries(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        $account = $this->tradeAccountOrNull($customer);
        if ($account === null) {
            return response()->json([
                'data' => [],
                'meta' => ['current_page' => 1, 'last_page' => 1, 'per_page' => 15, 'total' => 0],
            ]);
        }

        $paginator = TradeDelivery::query()
            ->where('trade_account_id', $account->id)
            ->whereNotIn('status', [TradeDelivery::STATUS_DRAFT, TradeDelivery::STATUS_CANCELLED])
            ->with(['lines.item'])
            ->orderByDesc('dispatched_at')
            ->orderByDesc('id')
            ->paginate(15);

        return response()->json([
            'data' => collect($paginator->items())->map(fn (TradeDelivery $d) => $this->serializeDelivery($d))->values(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function showDelivery(Request $request, int $id): JsonResponse
    {
        $customer = $this->customer($request);
        $delivery = $this->reports->findOwnDelivery($customer, $id);
        abort_if($delivery === null, 404);

        return response()->json(['delivery' => $this->serializeDelivery($delivery)]);
    }

    public function reportSales(Request $request, int $id): JsonResponse
    {
        $customer = $this->customer($request);
        $validated = $request->validate([
            'idempotency_key' => ['required', 'string', 'max:120'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.line_id' => ['required', 'integer'],
            'lines.*.sold_qty' => ['required', 'integer', 'min:0'],
        ]);

        try {
            $delivery = $this->reports->report(
                $customer,
                $id,
                $validated['lines'],
                $validated['idempotency_key'],
            );
        } catch (ValidationException $e) {
            $msg = collect($e->errors())->flatten()->first() ?? 'Could not save your sales report.';

            return response()->json(['message' => $msg, 'errors' => $e->errors()], 422);
        }

        return response()->json([
            'delivery' => $this->serializeDelivery($delivery),
            'message' => 'Thanks — we have your sales numbers.',
        ]);
    }

    public function statement(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        $account = $this->tradeAccountOrNull($customer);
        if ($account === null) {
            return response()->json([
                'statement' => [
                    'balance_owed_mvr' => 0,
                    'overdue_mvr' => 0,
                    'invoices' => [],
                    'payments' => [],
                    'entries' => [],
                ],
            ]);
        }

        $invoices = Invoice::query()
            ->where('trade_account_id', $account->id)
            ->where('customer_id', $customer->id)
            ->where('type', 'sale')
            ->orderByDesc('issue_date')
            ->orderByDesc('id')
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
                'total_mvr' => round(((int) $inv->total_laar) / 100, 2),
                'amount_paid_mvr' => round(((int) ($inv->amount_paid_laar ?? 0)) / 100, 2),
                'outstanding_mvr' => round($balance / 100, 2),
                'status' => $this->invoiceStatusLabel($inv, $overdue),
                'is_overdue' => $overdue,
                'can_pay' => $balance > 0 && ! in_array($inv->status, ['paid', 'void', 'cancelled'], true),
            ];
        });

        $paymentRows = Payment::query()
            ->whereIn('invoice_id', $invoices->pluck('id'))
            ->whereIn('status', ['confirmed', 'paid', 'completed'])
            ->orderByDesc('processed_at')
            ->get()
            ->map(fn (Payment $p) => [
                'id' => $p->id,
                'amount_mvr' => round(((int) $p->amount_laar) / 100, 2),
                'method' => $this->paymentMethodLabel((string) $p->method),
                'paid_at' => $p->processed_at?->toIso8601String() ?? $p->created_at?->toIso8601String(),
                'invoice_id' => $p->invoice_id,
            ]);

        $ledger = CustomerCreditLedger::query()
            ->where('customer_id', $customer->id)
            ->orderBy('id')
            ->get();

        $entries = $ledger->map(function (CustomerCreditLedger $row) {
            return [
                'id' => $row->id,
                'type' => match ($row->type) {
                    'charge' => 'invoice',
                    'payment' => 'payment',
                    default => 'adjustment',
                },
                'date' => $row->created_at?->toDateString(),
                'description' => $row->notes ?? $row->type,
                'amount_mvr' => round(abs((int) $row->amount_laar) / 100, 2),
                'direction' => (int) $row->amount_laar >= 0 ? 'charged' : 'paid',
                'running_balance_mvr' => round(((int) $row->balance_after_laar) / 100, 2),
                'invoice_id' => $row->invoice_id,
            ];
        });

        $overdueMvr = round($invoiceRows->where('is_overdue', true)->sum(fn ($r) => (float) $r['outstanding_mvr']), 2);
        $balanceOwedMvr = round(((int) $customer->credit_balance_laar) / 100, 2);

        return response()->json([
            'statement' => [
                'balance_owed_mvr' => $balanceOwedMvr,
                'overdue_mvr' => $overdueMvr,
                'invoices' => $invoiceRows->values(),
                'payments' => $paymentRows->values(),
                'entries' => $entries->values(),
            ],
        ]);
    }

    public function invoicePdf(Request $request, int $id): mixed
    {
        $customer = $this->customer($request);
        $invoice = $this->ownInvoice($customer, $id);
        abort_if($invoice === null, 404);

        $invoice->load(['items.item', 'items.inventoryItem', 'customer', 'supplier', 'order', 'createdBy']);

        try {
            $html = view('invoices.pdf', ['invoice' => $invoice])->render();

            if (class_exists(\Barryvdh\DomPDF\Facade\Pdf::class)) {
                try {
                    $pdf = \Barryvdh\DomPDF\Facade\Pdf::loadHTML($html);
                    $path = "invoices/{$invoice->invoice_number}.pdf";
                    Storage::put($path, $pdf->output());
                    $invoice->update(['pdf_path' => $path]);

                    return $pdf->download("{$invoice->invoice_number}.pdf");
                } catch (\Throwable $e) {
                    report($e);
                }
            }

            return response($html, 200, [
                'Content-Type' => 'text/html',
                'Content-Disposition' => "attachment; filename=\"{$invoice->invoice_number}.html\"",
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json(['message' => 'Unable to download this invoice right now.'], 500);
        }
    }

    public function payInvoice(Request $request, int $id): JsonResponse
    {
        app(ServiceAvailabilityService::class)->assertAvailable('online_payment');

        $customer = $this->customer($request);
        $invoice = $this->ownInvoice($customer, $id);
        abort_if($invoice === null, 404);

        $validated = $request->validate([
            'amount_mvr' => ['nullable', 'numeric', 'min:0.01'],
            'idempotency_key' => ['nullable', 'string', 'max:120'],
        ]);

        $amountLaar = null;
        if (array_key_exists('amount_mvr', $validated) && $validated['amount_mvr'] !== null) {
            $amountLaar = (int) round(((float) $validated['amount_mvr']) * 100);
        }

        try {
            $result = $this->payments->initiateBmlInvoicePayment(
                $invoice,
                $amountLaar,
                $validated['idempotency_key'] ?? null,
            );
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\RuntimeException $e) {
            Log::error('CustomerTradeController: BML invoice payment initiation failed', [
                'invoice_id' => $invoice->id,
                'customer_id' => $customer->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Payment is unavailable right now. Please try again in a moment.',
                'code' => 'gateway_error',
            ], 503);
        }

        return response()->json([
            'payment_url' => $result['payment_url'],
            'payment_id' => $result['payment_id'],
            'reused' => $result['reused'] ?? false,
        ]);
    }

    private function customer(Request $request): Customer
    {
        $customer = $request->user();
        if (! $customer instanceof Customer) {
            abort(403, 'Forbidden — customer access only.');
        }

        return $customer;
    }

    private function tradeAccountOrNull(Customer $customer): ?TradeAccount
    {
        return TradeAccount::query()
            ->where('customer_id', $customer->id)
            ->where('is_active', true)
            ->first();
    }

    private function ownInvoice(Customer $customer, int $invoiceId): ?Invoice
    {
        $account = $this->tradeAccountOrNull($customer);
        if ($account === null) {
            return null;
        }

        return Invoice::query()
            ->where('trade_account_id', $account->id)
            ->where('customer_id', $customer->id)
            ->whereKey($invoiceId)
            ->first();
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeDelivery(TradeDelivery $delivery): array
    {
        $salesReported = $delivery->lines->every(
            fn (TradeDeliveryLine $line) => $line->reported_sold_qty !== null,
        );

        return [
            'id' => $delivery->id,
            'delivery_number' => $delivery->delivery_number,
            'date' => $delivery->dispatched_at?->toDateString()
                ?? $delivery->created_at?->toDateString(),
            'status' => $this->deliveryStatusLabel($delivery->status),
            'sales_reported' => $salesReported,
            'can_report_sales' => $delivery->status === TradeDelivery::STATUS_DISPATCHED,
            'reported_at' => $delivery->reported_at?->toIso8601String(),
            'lines' => $delivery->lines->map(function (TradeDeliveryLine $line) {
                return [
                    'id' => $line->id,
                    'item_name' => $line->item?->name ?? 'Item',
                    'qty_delivered' => (int) $line->qty_sent,
                    'unit_price_mvr' => round(((int) $line->unit_price_laar) / 100, 2),
                    'reported_sold_qty' => $line->reported_sold_qty !== null
                        ? (int) $line->reported_sold_qty
                        : null,
                ];
            })->values(),
            'summary' => $this->deliverySummary($delivery),
        ];
    }

    private function deliverySummary(TradeDelivery $delivery): string
    {
        $count = $delivery->lines->count();
        $units = (int) $delivery->lines->sum('qty_sent');
        $items = $count === 1 ? '1 item' : "{$count} items";

        return "{$items}, {$units} units";
    }

    private function deliveryStatusLabel(string $status): string
    {
        return match ($status) {
            TradeDelivery::STATUS_DISPATCHED => 'Delivered',
            TradeDelivery::STATUS_RECONCILED => 'Checked',
            TradeDelivery::STATUS_INVOICED => 'Invoiced',
            TradeDelivery::STATUS_SETTLED => 'Paid',
            TradeDelivery::STATUS_CANCELLED => 'Cancelled',
            default => 'Pending',
        };
    }

    private function invoiceStatusLabel(Invoice $inv, bool $overdue): string
    {
        if ($inv->status === 'paid') {
            return 'Paid';
        }
        if ($overdue) {
            return 'Overdue';
        }
        if ((int) ($inv->amount_paid_laar ?? 0) > 0) {
            return 'Part paid';
        }

        return 'Unpaid';
    }

    private function paymentMethodLabel(string $method): string
    {
        return match ($method) {
            'bml_connect', 'card' => 'Card',
            'cash' => 'Cash',
            'bank_transfer' => 'Bank transfer',
            default => 'Payment',
        };
    }
}
