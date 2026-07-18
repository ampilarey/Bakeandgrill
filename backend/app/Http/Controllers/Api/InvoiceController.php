<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Gst\Services\GstInvoiceSequenceService;
use App\Domains\Gst\Services\GstLedgerPoster;
use App\Domains\Gst\Services\GstSettingsService;
use App\Domains\Gst\Services\GstTaxCalculator;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Domains\Orders\Support\EffectiveDiscount;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Purchase;
use App\Models\User;
use App\Rules\MaldivesPhone;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class InvoiceController extends Controller
{
    public function __construct(
        private readonly AuditLogService $audit,
        private readonly GstLedgerPoster $gstPoster,
        private readonly GstInvoiceSequenceService $gstSequence,
        private readonly GstSettingsService $gstSettings,
        private readonly OrderTotalsCalculator $orderTotals,
        private readonly GstTaxCalculator $gstTax,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = Invoice::with([
            'customer:id,name,phone',
            'supplier:id,name',
            'createdBy:id,name',
            'parentInvoice:id,invoice_number',
            'order:id,order_number',
            'purchase:id,purchase_number',
            'items.item:id,name',
            'items.inventoryItem:id,name',
        ])
            ->orderByDesc('issue_date');

        if ($request->filled('type')) {
            $query->where('type', $request->query('type'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }
        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->query('customer_id'));
        }
        if ($request->filled('supplier_id')) {
            $query->where('supplier_id', $request->query('supplier_id'));
        }
        if ($request->filled('from')) {
            $query->whereDate('issue_date', '>=', $request->query('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('issue_date', '<=', $request->query('to'));
        }
        if ($request->filled('search')) {
            $raw = (string) $request->query('search');
            $term = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $raw) . '%';
            $query->where(function ($q) use ($term, $raw) {
                $q->where('invoice_number', 'like', $term)
                    ->orWhere('recipient_name', 'like', $term)
                    ->orWhere('recipient_phone', 'like', $term);
                if (ctype_digit($raw)) {
                    $q->orWhere('id', (int) $raw);
                }
            });
        }

        $paginator = $query->paginate(20);

        return response()->json([
            'data' => collect($paginator->items())->map(fn ($i) => $this->format($i)),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['required', 'in:sale,purchase,credit_note'],
            'order_id' => ['nullable', 'integer', 'exists:orders,id'],
            'purchase_id' => ['nullable', 'integer', 'exists:purchases,id'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'recipient_name' => ['nullable', 'string', 'max:200'],
            'recipient_phone' => ['nullable', 'string', 'max:30'],
            'recipient_email' => ['nullable', 'email', 'max:200'],
            'recipient_address' => ['nullable', 'string'],
            'issue_date' => ['required', 'date'],
            'due_date' => ['nullable', 'date', 'after_or_equal:issue_date'],
            'tax_rate_bp' => ['nullable', 'integer', 'min:0', 'max:10000'],
            'notes' => ['nullable', 'string'],
            'terms' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.description' => ['required', 'string', 'max:500'],
            'items.*.quantity' => ['required', 'numeric', 'min:0.001'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'items.*.unit' => ['nullable', 'string', 'max:20'],
            'items.*.item_id' => ['nullable', 'integer', 'exists:items,id'],
            'items.*.inventory_item_id' => ['nullable', 'integer', 'exists:inventory_items,id'],
            'items.*.tax_rate_bp' => ['nullable', 'integer', 'min:0', 'max:10000'],
            'is_tax_invoice' => ['sometimes', 'boolean'],
            'customer_tin' => ['nullable', 'string', 'max:30'],
        ]);

        if (!empty($validated['is_tax_invoice'])) {
            if (empty($validated['customer_tin']) && empty($validated['recipient_name'])) {
                return response()->json(['message' => 'Tax invoice requires customer TIN and recipient name.'], 422);
            }
            if (empty($validated['customer_tin'])) {
                return response()->json(['message' => 'Customer TIN is required for tax invoices.'], 422);
            }
        }

        $invoice = DB::transaction(function () use ($validated, $request) {
            $subtotal = 0.0;
            $taxTotal = 0.0;
            $lineItems = [];

            foreach ($validated['items'] as $line) {
                $qty = (float) $line['quantity'];
                $price = (float) $line['unit_price'];
                $lineTotal = round($qty * $price, 2);
                $taxBp = (int) ($line['tax_rate_bp'] ?? $validated['tax_rate_bp'] ?? 0);
                $lineTax = round($lineTotal * $taxBp / 10000, 2);

                $subtotal += $lineTotal;
                $taxTotal += $lineTax;

                $lineItems[] = [
                    'description' => $line['description'],
                    'quantity' => $qty,
                    'unit' => $line['unit'] ?? null,
                    'item_id' => $line['item_id'] ?? null,
                    'inventory_item_id' => $line['inventory_item_id'] ?? null,
                    'unit_price' => $price,
                    'unit_price_laar' => (int) round($price * 100),
                    'total' => $lineTotal,
                    'total_laar' => (int) round($lineTotal * 100),
                    'tax_rate_bp' => $taxBp,
                ];
            }

            $total = round($subtotal + $taxTotal, 2);

            $isTaxInvoice = !empty($validated['is_tax_invoice']);
            $inv = Invoice::create([
                'invoice_number' => $isTaxInvoice
                    ? $this->gstSequence->nextTaxInvoiceNumber()
                    : $this->generateInvoiceNumber(),
                'type' => $validated['type'],
                'status' => $isTaxInvoice ? 'sent' : 'draft',
                'is_tax_invoice' => $isTaxInvoice,
                'customer_tin' => $validated['customer_tin'] ?? null,
                'order_id' => $validated['order_id'] ?? null,
                'purchase_id' => $validated['purchase_id'] ?? null,
                'customer_id' => $validated['customer_id'] ?? null,
                'supplier_id' => $validated['supplier_id'] ?? null,
                'created_by' => $request->user()->id,
                'recipient_name' => $validated['recipient_name'] ?? null,
                'recipient_phone' => $validated['recipient_phone'] ?? null,
                'recipient_email' => $validated['recipient_email'] ?? null,
                'recipient_address' => $validated['recipient_address'] ?? null,
                'subtotal' => $subtotal,
                'subtotal_laar' => (int) round($subtotal * 100),
                'tax_amount' => $taxTotal,
                'tax_laar' => (int) round($taxTotal * 100),
                'discount_amount' => 0,
                'discount_laar' => 0,
                'total' => $total,
                'total_laar' => (int) round($total * 100),
                'tax_rate_bp' => (int) ($validated['tax_rate_bp'] ?? 0),
                'issue_date' => $validated['issue_date'],
                'due_date' => $validated['due_date'] ?? null,
                'notes' => $validated['notes'] ?? null,
                'terms' => $validated['terms'] ?? null,
            ]);

            foreach ($lineItems as $line) {
                $inv->items()->create($line);
            }

            return $inv;
        });

        $this->audit->log('invoice.created', 'Invoice', $invoice->id, [], ['number' => $invoice->invoice_number], [], $request);

        if ($invoice->is_tax_invoice && $invoice->status === 'sent') {
            $this->gstPoster->postTaxInvoice($invoice, $request->user()?->id);
        }

        return response()->json(['invoice' => $this->format($invoice->load('items'))], 201);
    }

    public function show(int $id): JsonResponse
    {
        $invoice = Invoice::with(['items.item:id,name', 'items.inventoryItem:id,name', 'customer:id,name,phone', 'supplier:id,name', 'order:id,order_number', 'createdBy:id,name', 'parentInvoice:id,invoice_number'])->findOrFail($id);

        return response()->json(['invoice' => $this->format($invoice)]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $invoice = Invoice::findOrFail($id);

        if ($invoice->status !== 'draft') {
            return response()->json(['message' => 'Only draft invoices can be edited.'], 422);
        }

        $validated = $request->validate([
            'recipient_name' => ['nullable', 'string', 'max:200'],
            'recipient_phone' => ['nullable', 'string', 'max:30'],
            'recipient_email' => ['nullable', 'email', 'max:200'],
            'recipient_address' => ['nullable', 'string'],
            'due_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
            'terms' => ['nullable', 'string'],
        ]);

        $invoice->update($validated);

        return response()->json(['invoice' => $this->format($invoice->fresh())]);
    }

    public function markSent(Request $request, int $id): JsonResponse
    {
        $invoice = Invoice::findOrFail($id);
        $invoice->update(['status' => 'sent']);
        $this->audit->log('invoice.sent', 'Invoice', $invoice->id, [], [], [], $request);

        if ($invoice->is_tax_invoice) {
            $this->gstPoster->postTaxInvoice($invoice->fresh(), $request->user()?->id);
        }

        return response()->json(['invoice' => $this->format($invoice->fresh())]);
    }

    public function markPaid(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'payment_method' => ['required', 'string', 'max:50'],
            'payment_reference' => ['nullable', 'string', 'max:200'],
        ]);

        $invoice = Invoice::findOrFail($id);
        $totalLaar = (int) ($invoice->total_laar ?? round((float) $invoice->total * 100));
        $invoice->update([
            'status' => 'paid',
            'paid_at' => now(),
            'payment_method' => $validated['payment_method'],
            'payment_reference' => $validated['payment_reference'] ?? null,
            'amount_paid_laar' => $totalLaar,
        ]);
        $this->audit->log('invoice.paid', 'Invoice', $invoice->id, [], [], [], $request);

        return response()->json(['invoice' => $this->format($invoice->fresh())]);
    }

    public function voidInvoice(Request $request, int $id): JsonResponse
    {
        $invoice = Invoice::findOrFail($id);

        if (in_array($invoice->status, ['void', 'cancelled'])) {
            return response()->json(['message' => 'Invoice is already void/cancelled.'], 422);
        }

        $invoice->update(['status' => 'void']);
        $this->audit->log('invoice.voided', 'Invoice', $invoice->id, [], [], [], $request);

        return response()->json(['invoice' => $this->format($invoice->fresh())]);
    }

    public function createCreditNote(Request $request, int $id): JsonResponse
    {
        $parent = Invoice::with('items')->findOrFail($id);

        $validated = $request->validate([
            'credit_note_reason' => ['nullable', 'string', 'max:500'],
        ]);

        $creditNote = DB::transaction(function () use ($parent, $request, $validated) {
            $cn = Invoice::create([
                'invoice_number' => $this->gstSequence->nextCreditNoteNumber(),
                'type' => 'credit_note',
                'status' => 'sent',
                'is_tax_invoice' => (bool) $parent->is_tax_invoice,
                'parent_invoice_id' => $parent->id,
                'customer_id' => $parent->customer_id,
                'customer_tin' => $parent->customer_tin,
                'supplier_id' => $parent->supplier_id,
                'created_by' => $request->user()->id,
                'recipient_name' => $parent->recipient_name,
                'recipient_phone' => $parent->recipient_phone,
                'recipient_address' => $parent->recipient_address,
                'subtotal' => $parent->subtotal,
                'subtotal_laar' => $parent->subtotal_laar,
                'tax_amount' => $parent->tax_amount,
                'tax_laar' => $parent->tax_laar,
                'discount_amount' => $parent->discount_amount,
                'discount_laar' => $parent->discount_laar,
                'total' => $parent->total,
                'total_laar' => $parent->total_laar,
                'tax_rate_bp' => $parent->tax_rate_bp,
                'issue_date' => now()->toDateString(),
                'notes' => "Credit note for {$parent->invoice_number}",
                'credit_note_reason' => $validated['credit_note_reason'] ?? null,
            ]);

            foreach ($parent->items as $item) {
                $cn->items()->create($item->only([
                    'item_id', 'inventory_item_id', 'description',
                    'quantity', 'unit', 'unit_price', 'unit_price_laar',
                    'total', 'total_laar', 'tax_rate_bp',
                ]));
            }

            return $cn;
        });

        $this->gstPoster->postCreditNote($creditNote->fresh(), $request->user()?->id);

        return response()->json(['invoice' => $this->format($creditNote->load('items'))], 201);
    }

    public function generatePdf(int $id): mixed
    {
        $invoice = Invoice::with(['items.item', 'items.inventoryItem', 'customer', 'supplier', 'order', 'createdBy'])->findOrFail($id);

        try {
            $html = view('invoices.pdf', ['invoice' => $invoice])->render();

            // Try dompdf if available; fall back to HTML when rendering fails (e.g. missing fonts in CI).
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

            $payload = ['message' => 'Unable to generate invoice PDF.'];
            if (app()->environment('testing')) {
                $payload['error'] = $e->getMessage();
            }

            return response()->json($payload, 500);
        }
    }

    public function createFromOrder(Request $request, int $orderId): JsonResponse
    {
        $validated = $request->validate([
            'is_tax_invoice' => ['sometimes', 'boolean'],
            'customer_tin' => ['nullable', 'string', 'max:30'],
            'recipient_name' => ['nullable', 'string', 'max:200'],
            'recipient_address' => ['nullable', 'string'],
        ]);

        $order = Order::with(['items.item', 'customer'])->findOrFail($orderId);
        $invoice = $this->createFromOrderInternal($order, $request->user(), $validated);

        $created = $invoice->wasRecentlyCreated;
        $this->audit->log('invoice.created_from_order', 'Invoice', $invoice->id, [], ['order_id' => $orderId], [], $request);

        if ($invoice->is_tax_invoice && $invoice->status === 'sent') {
            $this->gstPoster->postTaxInvoice($invoice, $request->user()?->id);
        }

        return response()->json(['invoice' => $this->format($invoice->load('items'))], $created ? 201 : 200);
    }

    /**
     * Create (or return existing) a sale invoice from an order.
     * Reusable internally without wrapping in a JsonResponse.
     *
     * If an unpaid draft/sent invoice already exists but the order lines
     * or totals have changed (POS "Save changes" after Send Bill), the
     * invoice is rewritten so the public link and a resend SMS match
     * the current ticket. Paid / tax invoices are never rewritten.
     */
    public function createFromOrderInternal(Order $order, ?User $actor, array $options = []): Invoice
    {
        return DB::transaction(function () use ($order, $actor, $options) {
            // Always re-read the order + lines under lock. Callers often pass
            // an in-memory model whose `items` relation is stale/empty
            // (e.g. mid-edit), and loadMissing() will NOT refresh it.
            $order = Order::with(['items.item', 'customer'])
                ->lockForUpdate()
                ->findOrFail($order->id);

            // Repair header totals when lines have value but total is 0.
            $order = $this->orderTotals->repairZeroTotalFromItems($order);

            $existing = Invoice::where('order_id', $order->id)->where('type', 'sale')->first();
            if ($existing) {
                if ($this->shouldSyncSaleInvoiceFromOrder($existing, $order)) {
                    return $this->syncSaleInvoiceFromOrder($existing, $order);
                }

                // Even when "in sync" by line shape, never leave a zeroed
                // invoice header when the order now has a positive total.
                if ((float) $existing->total <= 0 && (float) $order->total > 0) {
                    return $this->syncSaleInvoiceFromOrder($existing, $order);
                }

                return $existing->loadMissing('items');
            }

            $isTaxInvoice = (bool) ($options['is_tax_invoice'] ?? false);
            $customerTin = $options['customer_tin'] ?? $order->customer?->tin;
            $invoiceNumber = $isTaxInvoice
                ? $this->gstSequence->nextTaxInvoiceNumber()
                : $this->generateInvoiceNumber();

            $inv = Invoice::create([
                'invoice_number' => $invoiceNumber,
                'type' => 'sale',
                'status' => $isTaxInvoice ? 'sent' : 'draft',
                'is_tax_invoice' => $isTaxInvoice,
                'order_id' => $order->id,
                'customer_id' => $order->customer_id,
                'customer_tin' => $customerTin,
                'created_by' => $actor?->id,
                'recipient_name' => $options['recipient_name'] ?? $order->customer?->name,
                'recipient_phone' => $order->customer?->phone,
                'recipient_address' => $options['recipient_address'] ?? $order->customer?->billing_address,
                'subtotal' => $order->subtotal ?? $order->total,
                'subtotal_laar' => (int) ($order->subtotal_laar ?? round(($order->subtotal ?? $order->total) * 100)),
                'tax_amount' => $order->tax_amount ?? 0,
                'tax_laar' => (int) ($order->tax_laar ?? round(($order->tax_amount ?? 0) * 100)),
                'discount_amount' => $order->discount_amount ?? 0,
                'discount_laar' => (int) (
                    EffectiveDiscount::effectiveTotalLaar(
                        (int) ($order->subtotal_laar ?? round((float) ($order->subtotal ?? 0) * 100)),
                        EffectiveDiscount::partsFromOrder($order),
                    ) ?: round((float) ($order->discount_amount ?? 0) * 100)
                ),
                'total' => $order->total,
                'total_laar' => (int) ($order->total_laar ?? round($order->total * 100)),
                'tax_rate_bp' => $order->tax_rate_bp ?: $this->gstSettings->defaultTaxRateBp(),
                'issue_date' => now()->toDateString(),
            ]);

            $this->writeSaleInvoiceItemsFromOrder($inv, $order);

            return $this->ensureInvoiceHeaderMatchesLines($inv->fresh('items'), $order);
        });
    }

    /**
     * Mirror order payments onto the linked sale invoice.
     *
     * Send Bill creates a durable invoice snapshot; cash/card/BML settlement
     * historically updated only the order — leaving the public /invoices/{token}
     * page stuck on "balance due". Credit (house_account) invoices stay open
     * until repayment (CreditLedgerService).
     */
    public function syncPaymentStateFromOrder(Order $order): ?Invoice
    {
        $invoice = Invoice::where('order_id', $order->id)->where('type', 'sale')->first();
        if (!$invoice || in_array($invoice->status, ['void', 'cancelled'], true)) {
            return $invoice;
        }

        $order->loadMissing('payments');
        $invoice->setRelation('order', $order);

        // Credit charges keep the invoice open until the customer repays.
        if ($invoice->isOnCreditAccount()) {
            return $invoice;
        }

        $paidTotalLaar = (int) $order->payments()
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->selectRaw('SUM(COALESCE(amount_laar, ROUND(amount * 100))) as total_laar')
            ->value('total_laar');

        $invoiceTotalLaar = (int) ($invoice->total_laar ?? round((float) $invoice->total * 100));
        if ($invoiceTotalLaar <= 0) {
            $invoiceTotalLaar = (int) ($order->total_laar ?? round((float) $order->total * 100));
        }

        $amountPaidLaar = $invoiceTotalLaar > 0
            ? min($paidTotalLaar, $invoiceTotalLaar)
            : $paidTotalLaar;

        $primaryMethod = $order->payments()
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->orderByDesc('id')
            ->value('method');

        $updates = [];
        if ((int) ($invoice->amount_paid_laar ?? 0) !== $amountPaidLaar) {
            $updates['amount_paid_laar'] = $amountPaidLaar;
        }

        if ($invoiceTotalLaar > 0 && $paidTotalLaar >= $invoiceTotalLaar) {
            if ($invoice->status !== 'paid') {
                $updates['status'] = 'paid';
                $updates['paid_at'] = $order->paid_at ?? now();
                $updates['payment_method'] = $primaryMethod;
            }
        } elseif ($invoice->status === 'paid' && $paidTotalLaar < $invoiceTotalLaar) {
            // Payment reversed / partial after a mistaken paid mark.
            $updates['status'] = 'sent';
            $updates['paid_at'] = null;
            $updates['payment_method'] = null;
            $updates['payment_reference'] = null;
        }

        if ($updates !== []) {
            $invoice->update($updates);
        }

        return $invoice->fresh();
    }

    /**
     * Refresh an open (unpaid) sale invoice when the linked order was edited.
     * No-op when no invoice exists or the invoice is finalised.
     */
    public function syncOpenSaleInvoiceFromOrder(Order $order): ?Invoice
    {
        return DB::transaction(function () use ($order) {
            $order = Order::with(['items.item', 'customer'])
                ->lockForUpdate()
                ->findOrFail($order->id);

            $order = $this->orderTotals->repairZeroTotalFromItems($order);

            $existing = Invoice::where('order_id', $order->id)->where('type', 'sale')->first();
            if (!$existing) {
                return null;
            }

            if (
                !$this->shouldSyncSaleInvoiceFromOrder($existing, $order)
                && !((float) $existing->total <= 0 && (float) $order->total > 0)
            ) {
                return $existing->loadMissing('items');
            }

            return $this->syncSaleInvoiceFromOrder($existing, $order);
        });
    }

    private function shouldSyncSaleInvoiceFromOrder(Invoice $invoice, Order $order): bool
    {
        if ($invoice->type !== 'sale') {
            return false;
        }
        // Never rewrite GST tax invoices or anything already collected against.
        if ($invoice->is_tax_invoice) {
            return false;
        }
        if (in_array($invoice->status, ['paid', 'void', 'cancelled'], true)) {
            return false;
        }
        if ((int) ($invoice->amount_paid_laar ?? 0) > 0) {
            return false;
        }
        // Credit notes keep a fixed snapshot of the original invoice.
        if ($invoice->parent_invoice_id) {
            return false;
        }

        // Never wipe a good invoice with an empty order snapshot.
        if ($order->items->isEmpty()) {
            return false;
        }

        $lineLaar = $this->orderTotals->lineItemsSubtotalLaar($order);
        $orderTotalLaar = (int) ($order->total_laar ?? round((float) $order->total * 100));
        // Prefer line-derived value when the header is still zeroed.
        if ($orderTotalLaar <= 0 && $lineLaar > 0) {
            $orderTotalLaar = $lineLaar;
        }

        if ($orderTotalLaar <= 0 && (int) $invoice->total_laar > 0) {
            return false;
        }

        if ((int) $invoice->total_laar !== $orderTotalLaar) {
            return true;
        }

        $invoice->loadMissing('items');

        if ($invoice->items->count() !== $order->items->count()) {
            return true;
        }

        return $this->saleInvoiceLineTotalsDiffer($invoice, $order);
    }

    private function saleInvoiceLineTotalsDiffer(Invoice $invoice, Order $order): bool
    {
        $orderLines = $order->items
            ->map(fn ($oi) => [
                'item_id' => (int) ($oi->item_id ?? 0),
                'qty' => round((float) $oi->quantity, 3),
                'unit' => round((float) ($oi->unit_price ?? 0), 2),
            ])
            ->sortBy(fn ($r) => $r['item_id'] . ':' . $r['unit'] . ':' . $r['qty'])
            ->values()
            ->all();

        $invoiceLines = $invoice->items
            ->map(fn ($ii) => [
                'item_id' => (int) ($ii->item_id ?? 0),
                'qty' => round((float) $ii->quantity, 3),
                'unit' => round((float) ($ii->unit_price ?? 0), 2),
            ])
            ->sortBy(fn ($r) => $r['item_id'] . ':' . $r['unit'] . ':' . $r['qty'])
            ->values()
            ->all();

        return $orderLines !== $invoiceLines;
    }

    private function syncSaleInvoiceFromOrder(Invoice $invoice, Order $order): Invoice
    {
        $order = $this->orderTotals->repairZeroTotalFromItems($order);

        $total = (float) $order->total;
        $totalLaar = (int) ($order->total_laar ?? round($total * 100));
        if ($totalLaar <= 0) {
            $totalLaar = $this->orderTotals->lineItemsSubtotalLaar($order);
            $total = round($totalLaar / 100, 2);
        }

        $subtotal = (float) ($order->subtotal ?? $total);
        $subtotalLaar = (int) ($order->subtotal_laar ?? round($subtotal * 100));
        if ($subtotalLaar <= 0 && $totalLaar > 0) {
            $subtotalLaar = $totalLaar;
            $subtotal = $total;
        }

        $invoice->update([
            'customer_id' => $order->customer_id ?? $invoice->customer_id,
            'recipient_name' => $order->customer?->name ?? $invoice->recipient_name,
            'recipient_phone' => $order->customer?->phone ?? $invoice->recipient_phone,
            'recipient_address' => $order->customer?->billing_address ?? $invoice->recipient_address,
            'subtotal' => $subtotal,
            'subtotal_laar' => $subtotalLaar,
            'tax_amount' => $order->tax_amount ?? 0,
            'tax_laar' => (int) ($order->tax_laar ?? round(($order->tax_amount ?? 0) * 100)),
            'discount_amount' => $order->discount_amount ?? 0,
            'discount_laar' => EffectiveDiscount::effectiveTotalLaar(
                $subtotalLaar,
                EffectiveDiscount::partsFromOrder($order),
            ) ?: (int) round((float) ($order->discount_amount ?? 0) * 100),
            'total' => $total,
            'total_laar' => $totalLaar,
            'tax_rate_bp' => $order->tax_rate_bp ?: $invoice->tax_rate_bp,
        ]);

        $invoice->items()->delete();
        $this->writeSaleInvoiceItemsFromOrder($invoice, $order);

        return $this->ensureInvoiceHeaderMatchesLines($invoice->fresh('items'), $order);
    }

    /**
     * Final safety net: if the invoice header is 0 but the order/lines have
     * value, copy authoritative order totals (never promote pre-tax line sum
     * to grand total — that drops GST).
     */
    private function ensureInvoiceHeaderMatchesLines(Invoice $invoice, Order $order): Invoice
    {
        $invoice->loadMissing('items');
        $orderTotalLaar = (int) ($order->total_laar ?? round((float) ($order->total ?? 0) * 100));
        if ($orderTotalLaar <= 0) {
            $order = $this->orderTotals->repairZeroTotalFromItems($order);
            $orderTotalLaar = (int) ($order->total_laar ?? round((float) ($order->total ?? 0) * 100));
        }

        if ($orderTotalLaar > 0 && (int) ($invoice->total_laar ?? 0) <= 0) {
            $subLaar = (int) ($order->subtotal_laar ?? round((float) ($order->subtotal ?? 0) * 100));
            $taxLaar = (int) ($order->tax_laar ?? round((float) ($order->tax_amount ?? 0) * 100));
            $discountLaar = EffectiveDiscount::effectiveTotalLaar(
                $subLaar,
                EffectiveDiscount::partsFromOrder($order),
            );
            $invoice->update([
                'subtotal' => round($subLaar / 100, 2),
                'subtotal_laar' => $subLaar,
                'tax_amount' => round($taxLaar / 100, 2),
                'tax_laar' => $taxLaar,
                'discount_amount' => round($discountLaar / 100, 2),
                'discount_laar' => $discountLaar,
                'total' => round($orderTotalLaar / 100, 2),
                'total_laar' => $orderTotalLaar,
            ]);
            $invoice->refresh();
        }

        return $invoice->loadMissing('items');
    }

    private function writeSaleInvoiceItemsFromOrder(Invoice $invoice, Order $order): void
    {
        foreach ($order->items as $oi) {
            $price = (float) ($oi->unit_price ?? $oi->item?->base_price ?? 0);
            $qty = (float) $oi->quantity;
            $total = round((float) ($oi->total_price ?? ($price * $qty)), 2);
            $description = trim((string) ($oi->item_name ?? $oi->item?->name ?? 'Item'));
            if (!empty($oi->variant_name)) {
                $description .= ' — ' . $oi->variant_name;
            }

            $invoice->items()->create([
                'item_id' => $oi->item_id,
                'description' => $description,
                'quantity' => $qty,
                'unit_price' => $price,
                'unit_price_laar' => (int) round($price * 100),
                'total' => $total,
                'total_laar' => (int) round($total * 100),
                'tax_rate_bp' => $this->gstTax->resolveTaxRateBp($oi->tax_code ?? $oi->item?->tax_code ?? null),
            ]);
        }
    }

    /**
     * POST /api/invoices/{id}/send
     *
     * Send the invoice link to a customer via SMS.
     */
    public function sendToCustomer(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'phone' => ['required', 'string', 'max:30', new MaldivesPhone],
        ]);

        $invoice = Invoice::findOrFail($id);
        $phone = MaldivesPhone::normalize($request->phone);
        $link = rtrim(config('app.url'), '/') . '/invoices/' . $invoice->token;

        app(SmsService::class)->send(new SmsMessage(
            to: $phone,
            message: 'Bill #' . $invoice->invoice_number . ' — MVR ' . number_format((float) $invoice->total, 2) . '. View: ' . $link,
            type: 'transactional',
            referenceType: 'invoice',
            referenceId: (string) $invoice->id,
            idempotencyKey: 'invoice:send:' . $invoice->id . ':' . $phone . ':' . (int) $invoice->total_laar,
        ));

        $invoice->update([
            'recipient_phone' => $phone,
            'status' => $invoice->status === 'draft' ? 'sent' : $invoice->status,
        ]);

        $this->audit->log('invoice.sent_to_customer', 'Invoice', $invoice->id, [], ['phone' => $phone], [], $request);

        return response()->json([
            'invoice' => $this->format($invoice->fresh()),
            'link' => $link,
        ]);
    }

    public function createFromPurchase(Request $request, int $purchaseId): JsonResponse
    {
        $purchase = Purchase::with(['items.inventoryItem', 'supplier'])->findOrFail($purchaseId);

        $invoice = DB::transaction(function () use ($purchase, $request, $purchaseId) {
            // Lock the purchase row to prevent concurrent calls creating duplicate invoices.
            Purchase::lockForUpdate()->findOrFail($purchaseId);

            $existing = Invoice::where('purchase_id', $purchaseId)->where('type', 'purchase')->first();
            if ($existing) {
                return $existing->load('items');
            }
            $inv = Invoice::create([
                'invoice_number' => $this->generateInvoiceNumber(),
                'type' => 'purchase',
                'status' => 'draft',
                'purchase_id' => $purchase->id,
                'supplier_id' => $purchase->supplier_id,
                'created_by' => $request->user()->id,
                'recipient_name' => $purchase->supplier?->name,
                'recipient_phone' => $purchase->supplier?->phone,
                'subtotal' => $purchase->subtotal ?? $purchase->total,
                'subtotal_laar' => (int) round(($purchase->subtotal ?? $purchase->total) * 100),
                'tax_amount' => 0,
                'tax_laar' => 0,
                'discount_amount' => 0,
                'discount_laar' => 0,
                'total' => $purchase->total,
                'total_laar' => (int) round($purchase->total * 100),
                'issue_date' => $purchase->purchase_date ?? now()->toDateString(),
            ]);

            foreach ($purchase->items as $pi) {
                $price = (float) $pi->unit_cost;
                $qty = (float) $pi->quantity;
                $total = round($price * $qty, 2);

                $inv->items()->create([
                    'inventory_item_id' => $pi->inventory_item_id,
                    'description' => $pi->inventoryItem?->name ?? 'Item',
                    'quantity' => $qty,
                    'unit' => $pi->inventoryItem?->unit,
                    'unit_price' => $price,
                    'unit_price_laar' => (int) round($price * 100),
                    'total' => $total,
                    'total_laar' => (int) round($total * 100),
                ]);
            }

            return $inv;
        });

        return response()->json(['invoice' => $this->format($invoice->load('items'))], 201);
    }

    private function generateInvoiceNumber(): string
    {
        // Lock today's invoice rows to prevent duplicate numbers under concurrency.
        // PostgreSQL rejects FOR UPDATE with COUNT(*); materialize rows then count in PHP.
        $date = now()->format('Ymd');
        $count = Invoice::whereDate('created_at', now()->toDateString())
            ->withTrashed()
            ->lockForUpdate()
            ->get(['id'])
            ->count() + 1;

        return 'INV-' . $date . '-' . str_pad((string) $count, 4, '0', STR_PAD_LEFT);
    }

    private function format(Invoice $inv): array
    {
        $inv->loadMissing([
            'customer:id,name,phone',
            'supplier:id,name',
            'createdBy:id,name',
            'parentInvoice:id,invoice_number',
            'order:id,order_number',
            'purchase:id,purchase_number',
            'items.item:id,name',
            'items.inventoryItem:id,name',
        ]);

        return [
            'id' => $inv->id,
            'invoice_number' => $inv->invoice_number,
            'type' => $inv->type,
            'status' => $inv->status,
            'is_tax_invoice' => (bool) $inv->is_tax_invoice,
            'customer_tin' => $inv->customer_tin,
            'credit_note_reason' => $inv->credit_note_reason,
            'recipient_name' => $inv->recipient_name,
            'recipient_phone' => $inv->recipient_phone,
            'recipient_email' => $inv->recipient_email,
            'recipient_address' => $inv->recipient_address,
            'subtotal' => (float) $inv->subtotal,
            'tax_amount' => (float) $inv->tax_amount,
            'discount_amount' => (float) $inv->discount_amount,
            'total' => (float) $inv->total,
            'amount_paid_laar' => (int) ($inv->amount_paid_laar ?? 0),
            'balance_due_laar' => $inv->balanceDueLaar(),
            'balance_due' => round($inv->balanceDueLaar() / 100, 2),
            'on_credit_account' => $inv->isOnCreditAccount(),
            'display_status' => $inv->displayStatusLabel(),
            'tax_rate_bp' => $inv->tax_rate_bp,
            'issue_date' => $inv->issue_date?->toDateString(),
            'due_date' => $inv->due_date?->toDateString(),
            'paid_at' => $inv->paid_at,
            'payment_method' => $inv->payment_method,
            'payment_reference' => $inv->payment_reference,
            'notes' => $inv->notes,
            'terms' => $inv->terms,
            'pdf_path' => $inv->pdf_path,
            'order_id' => $inv->order_id,
            'order' => $inv->order ? [
                'id' => $inv->order->id,
                'order_number' => $inv->order->order_number,
            ] : null,
            'purchase_id' => $inv->purchase_id,
            'purchase' => $inv->purchase ? [
                'id' => $inv->purchase->id,
                'purchase_number' => $inv->purchase->purchase_number,
            ] : null,
            'parent_invoice_id' => $inv->parent_invoice_id,
            'parent_invoice' => $inv->parentInvoice ? ['id' => $inv->parentInvoice->id, 'invoice_number' => $inv->parentInvoice->invoice_number] : null,
            'customer' => $inv->customer ? ['id' => $inv->customer->id, 'name' => $inv->customer->name, 'phone' => $inv->customer->phone] : null,
            'supplier' => $inv->supplier ? ['id' => $inv->supplier->id, 'name' => $inv->supplier->name] : null,
            'created_by' => $inv->createdBy?->name,
            'items' => $inv->relationLoaded('items') ? $inv->items->map(fn ($i) => [
                'id' => $i->id,
                'description' => $i->description,
                'quantity' => (float) $i->quantity,
                'unit' => $i->unit,
                'unit_price' => (float) $i->unit_price,
                'total' => (float) $i->total,
                'tax_rate_bp' => $i->tax_rate_bp,
                'item' => $i->item ? ['id' => $i->item->id, 'name' => $i->item->name] : null,
                'inventory_item' => $i->inventoryItem ? ['id' => $i->inventoryItem->id, 'name' => $i->inventoryItem->name] : null,
            ])->values() : [],
            'created_at' => $inv->created_at,
        ];
    }
}
