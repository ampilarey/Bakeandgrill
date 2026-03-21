<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Purchase;
use App\Models\User;
use App\Services\AuditLogService;
use App\Support\PhoneNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class InvoiceController extends Controller
{
    public function __construct(private readonly AuditLogService $audit) {}

    public function index(Request $request): JsonResponse
    {
        $query = Invoice::with(['customer:id,name,phone', 'supplier:id,name', 'createdBy:id,name'])
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
        ]);

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

            $inv = Invoice::create([
                'invoice_number' => $this->generateInvoiceNumber(),
                'type' => $validated['type'],
                'status' => 'draft',
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

        return response()->json(['invoice' => $this->format($invoice->fresh())]);
    }

    public function markPaid(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'payment_method' => ['required', 'string', 'max:50'],
            'payment_reference' => ['nullable', 'string', 'max:200'],
        ]);

        $invoice = Invoice::findOrFail($id);
        $invoice->update([
            'status' => 'paid',
            'paid_at' => now(),
            'payment_method' => $validated['payment_method'],
            'payment_reference' => $validated['payment_reference'] ?? null,
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

        $creditNote = DB::transaction(function () use ($parent, $request) {
            $cn = Invoice::create([
                'invoice_number' => $this->generateInvoiceNumber(),
                'type' => 'credit_note',
                'status' => 'draft',
                'parent_invoice_id' => $parent->id,
                'customer_id' => $parent->customer_id,
                'supplier_id' => $parent->supplier_id,
                'created_by' => $request->user()->id,
                'recipient_name' => $parent->recipient_name,
                'recipient_phone' => $parent->recipient_phone,
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

        return response()->json(['invoice' => $this->format($creditNote->load('items'))], 201);
    }

    public function generatePdf(int $id): mixed
    {
        $invoice = Invoice::with(['items.item', 'items.inventoryItem', 'customer', 'supplier', 'order', 'createdBy'])->findOrFail($id);

        $html = view('invoices.pdf', ['invoice' => $invoice])->render();

        // Try dompdf if available, otherwise return HTML download
        if (class_exists(\Barryvdh\DomPDF\Facade\Pdf::class)) {
            $pdf = \Barryvdh\DomPDF\Facade\Pdf::loadHTML($html);
            $path = "invoices/{$invoice->invoice_number}.pdf";
            Storage::put($path, $pdf->output());
            $invoice->update(['pdf_path' => $path]);

            return $pdf->download("{$invoice->invoice_number}.pdf");
        }

        return response($html, 200, [
            'Content-Type' => 'text/html',
            'Content-Disposition' => "attachment; filename=\"{$invoice->invoice_number}.html\"",
        ]);
    }

    public function createFromOrder(Request $request, int $orderId): JsonResponse
    {
        $order = Order::with(['items.item', 'customer'])->findOrFail($orderId);
        $invoice = $this->createFromOrderInternal($order, $request->user());

        $created = $invoice->wasRecentlyCreated;
        $this->audit->log('invoice.created_from_order', 'Invoice', $invoice->id, [], ['order_id' => $orderId], [], $request);

        return response()->json(['invoice' => $this->format($invoice->load('items'))], $created ? 201 : 200);
    }

    /**
     * Create (or return existing) a sale invoice from an order.
     * Reusable internally without wrapping in a JsonResponse.
     */
    public function createFromOrderInternal(Order $order, ?User $actor): Invoice
    {
        $order->loadMissing(['items.item', 'customer']);

        $existing = Invoice::where('order_id', $order->id)->where('type', 'sale')->first();
        if ($existing) {
            return $existing;
        }

        return DB::transaction(function () use ($order, $actor) {
            $inv = Invoice::create([
                'invoice_number' => $this->generateInvoiceNumber(),
                'type' => 'sale',
                'status' => 'draft',
                'order_id' => $order->id,
                'customer_id' => $order->customer_id,
                'created_by' => $actor?->id,
                'recipient_name' => $order->customer?->name,
                'recipient_phone' => $order->customer?->phone,
                'subtotal' => $order->subtotal ?? $order->total,
                'subtotal_laar' => (int) round(($order->subtotal ?? $order->total) * 100),
                'tax_amount' => $order->tax_amount ?? 0,
                'tax_laar' => (int) round(($order->tax_amount ?? 0) * 100),
                'discount_amount' => $order->discount_amount ?? 0,
                'discount_laar' => (int) round(($order->discount_amount ?? 0) * 100),
                'total' => $order->total,
                'total_laar' => (int) round($order->total * 100),
                'tax_rate_bp' => $order->tax_rate_bp ?? 0,
                'issue_date' => now()->toDateString(),
            ]);

            foreach ($order->items as $oi) {
                $price = (float) ($oi->unit_price ?? $oi->item?->base_price ?? 0);
                $qty = (float) $oi->quantity;
                $total = round($price * $qty, 2);

                $inv->items()->create([
                    'item_id' => $oi->item_id,
                    'description' => $oi->item?->name ?? 'Item',
                    'quantity' => $qty,
                    'unit_price' => $price,
                    'unit_price_laar' => (int) round($price * 100),
                    'total' => $total,
                    'total_laar' => (int) round($total * 100),
                    'tax_rate_bp' => $order->tax_rate_bp ?? 0,
                ]);
            }

            return $inv;
        });
    }

    /**
     * POST /api/invoices/{id}/send
     *
     * Send the invoice link to a customer via SMS.
     */
    public function sendToCustomer(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'phone' => ['required', 'string', 'max:30'],
        ]);

        $invoice = Invoice::findOrFail($id);
        $phone = PhoneNormalizer::normalize($request->phone);
        $link = rtrim(config('app.url'), '/') . '/invoices/' . $invoice->token;

        app(SmsService::class)->send(new SmsMessage(
            to: $phone,
            message: 'Bake & Grill: Your bill #' . $invoice->invoice_number . ' — MVR ' . number_format((float) $invoice->total, 2) . '. View: ' . $link,
            type: 'transactional',
            referenceType: 'invoice',
            referenceId: (string) $invoice->id,
            idempotencyKey: 'invoice:send:' . $invoice->id . ':' . $phone,
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

        $existing = Invoice::where('purchase_id', $purchaseId)->where('type', 'purchase')->first();
        if ($existing) {
            return response()->json(['invoice' => $this->format($existing->load('items'))]);
        }

        $invoice = DB::transaction(function () use ($purchase, $request) {
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
        // Lock the count to prevent duplicate invoice numbers under concurrency
        $date = now()->format('Ymd');
        $count = Invoice::whereDate('created_at', now()->toDateString())->withTrashed()->lockForUpdate()->count() + 1;

        return 'INV-' . $date . '-' . str_pad((string) $count, 4, '0', STR_PAD_LEFT);
    }

    private function format(Invoice $inv): array
    {
        return [
            'id' => $inv->id,
            'invoice_number' => $inv->invoice_number,
            'type' => $inv->type,
            'status' => $inv->status,
            'recipient_name' => $inv->recipient_name,
            'recipient_phone' => $inv->recipient_phone,
            'recipient_email' => $inv->recipient_email,
            'recipient_address' => $inv->recipient_address,
            'subtotal' => (float) $inv->subtotal,
            'tax_amount' => (float) $inv->tax_amount,
            'discount_amount' => (float) $inv->discount_amount,
            'total' => (float) $inv->total,
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
            'purchase_id' => $inv->purchase_id,
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
