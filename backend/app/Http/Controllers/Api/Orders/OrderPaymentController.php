<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Orders;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\SmsNotificationSettings;
use App\Domains\Payments\Actions\SettleOrderPaymentAction;
use App\Domains\Payments\Services\PaymentAllocationService;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreOrderPaymentsRequest;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Receipt;
use App\Rules\MaldivesPhone;
use App\Services\AuditLogService;
use App\Services\ShiftAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class OrderPaymentController extends Controller
{
    /**
     * POST /api/orders/{id}/send-pay-link
     *
     * Mints a receipt pay-page URL and SMSes it to the customer. Powers the
     * "Send pay link" button on the POS Open Tickets row.
     *
     * The SMS link opens GET /pay/{token} where the customer reviews the
     * order, agrees to terms, and only then is redirected to BML Connect.
     * (Online orders use the React checkout app instead.)
     *
     * Always uses the live remaining balance so a partial cash payment
     * at the counter shortens the link total — customer pays only the
     * outstanding amount online.
     *
     * No-ops cleanly if:
     *   - order is already paid (returns 422 — cashier sees "already paid")
     *   - customer has no phone
     *
     * BML is only called when the customer taps Pay on the pay page. If BML
     * credentials are missing at that point, they see an error on /pay/{token}.
     */
    public function sendPayLink(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $request->validate([
            'phone' => ['nullable', 'string', 'max:30', new MaldivesPhone],
        ]);

        $order = Order::with(['customer', 'payments'])->findOrFail($id);

        if ($order->payment_status === 'paid' || $order->status === 'paid') {
            return response()->json(['message' => 'Order is already fully paid.'], 422);
        }

        $rawPhone = $request->input('phone');
        if ($rawPhone !== null && trim((string) $rawPhone) !== '') {
            $phone = MaldivesPhone::normalize((string) $rawPhone);
            $customer = Customer::firstOrCreate(
                ['phone' => $phone],
                ['loyalty_points' => 0, 'tier' => 'bronze'],
            );
            if (!$order->customer_id) {
                $order->update(['customer_id' => $customer->id]);
                $order->setRelation('customer', $customer);
            }
        } else {
            $phone = $order->customer?->phone;
        }

        if (!$phone) {
            return response()->json(['message' => 'Attach a customer phone before sending a pay link.'], 422);
        }

        if (!SmsNotificationSettings::isEnabled(SmsNotificationSettings::POS_SEND_PAY_LINK)) {
            return response()->json(['message' => SmsNotificationSettings::DISABLED_MESSAGE], 422);
        }

        // Compute remaining balance via the same helper the rest of the
        // payment stack uses (COALESCE-safe for legacy POS payments).
        $paymentService = app(\App\Domains\Payments\Services\PaymentService::class);
        $remainingLaar = $paymentService->getRemainingBalanceLaar($order);

        if ($remainingLaar === 0) {
            return response()->json(['message' => 'Nothing left to charge.'], 422);
        }

        // Mint a receipt token and send the customer to our pay page first —
        // they review the order, agree to terms, then we redirect to BML.
        // (Online ordering uses the React checkout app; POS uses this Blade flow.)
        $receipt = Receipt::ensureForOrder($order);
        $payPageUrl = $receipt->posPayPageUrl();

        $idempotencyKey = 'paylink:' . $order->id . ':' . now()->format('YmdHis');

        try {
            $orderNum = $order->order_number ?? "#{$order->id}";
            $amount = number_format($remainingLaar / 100, 2);
            $rawName = trim((string) ($order->customer?->name ?? ''));
            $firstName = $rawName !== '' ? trim(strtok($rawName, ' ')) : '';
            $greeting = $firstName !== '' ? "Hi {$firstName}!" : 'Hi!';
            $fallback = implode("\n", [
                "{$greeting} Your Bake & Grill bill is ready to pay.",
                "Amount: MVR {$amount}",
                "Order: {$orderNum}",
                "View your order & pay: {$payPageUrl}",
                'Thanks — see you soon!',
            ]);
            $message = app(CustomerSmsMessageBuilder::class)->build(
                CustomerSmsMessageBuilder::SLUG_SEND_PAY_LINK,
                [
                    'greeting' => $greeting,
                    'amount' => $amount,
                    'order_number' => (string) $orderNum,
                    'pay_url' => $payPageUrl,
                ],
                $fallback,
            );
            app(SmsService::class)->send(new SmsMessage(
                to: $phone,
                message: $message,
                type: 'transactional',
                customerId: $order->customer_id,
                referenceType: 'order',
                referenceId: (string) $order->id,
                idempotencyKey: 'order:' . $idempotencyKey,
            ));
        } catch (\Throwable $e) {
            Log::error('sendPayLink: SMS failed', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Pay link created but SMS failed. Read it to the customer manually.',
                'pay_page_url' => $payPageUrl,
            ], 502);
        }

        app(AuditLogService::class)->log(
            'order.paylink_sent',
            'Order',
            $order->id,
            [],
            [
                'pay_page_url' => $payPageUrl,
                'amount_laar' => $remainingLaar,
                'sms_to' => $phone,
            ],
            [],
            $request,
        );

        return response()->json([
            'message' => 'Pay link sent.',
            'amount' => $remainingLaar / 100,
            'sent_to' => $phone,
            'pay_page_url' => $payPageUrl,
        ]);
    }

    public function addPayments(StoreOrderPaymentsRequest $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $validated = $request->validated();
        $printReceipt = !array_key_exists('print_receipt', $validated) || $validated['print_receipt'] === true;
        $allocation = app(PaymentAllocationService::class);
        $collector = $request->user();
        $collectorShift = null;

        if ($allocation->needsCollectorShift($validated['payments'])) {
            $collectorShift = app(ShiftAccessService::class)->requireOpenShift(
                $collector,
                'Open a shift before taking payment.',
            );
        }

        if ($allocation->needsCreditShift($validated['payments'])) {
            $isOwner = $collector->role?->slug === 'owner';
            if ($isOwner) {
                $collectorShift ??= app(ShiftAccessService::class)->findOpenShift($collector);
            } else {
                $creditShift = app(ShiftAccessService::class)->requireOpenShift(
                    $collector,
                    'Open a shift before charging customer credit.',
                );
                $collectorShift = $collectorShift ?? $creditShift;
            }
        }

        if ($allocation->needsDepositShift($validated['payments'])) {
            $isOwner = $collector->role?->slug === 'owner';
            if ($isOwner) {
                $collectorShift ??= app(ShiftAccessService::class)->findOpenShift($collector);
            } else {
                $depositShift = app(ShiftAccessService::class)->requireOpenShift(
                    $collector,
                    'Open a shift before using customer deposit payment.',
                );
                $collectorShift = $collectorShift ?? $depositShift;
            }
        }

        [$order, $paidTotal] = app(SettleOrderPaymentAction::class)->execute(
            $id,
            $validated,
            $collector,
            $collectorShift,
            $request,
            $printReceipt,
        );

        return response()->json([
            'order' => $order->fresh('payments'),
            'paid_total' => $paidTotal,
        ]);
    }

    /**
     * POST /api/orders/{id}/send-bill
     *
     * Cashier wants to surface the bill to the customer before payment.
     *
     * Two modes (single endpoint so we don't fan out to ensure-invoice +
     * send-invoice):
     *   - phone provided  → link the customer (firstOrCreate by phone),
     *                       create the invoice, SMS the public view link.
     *   - phone omitted   → ensure an invoice exists, return the link
     *                       only. Used by the POS "Print bill" button so
     *                       the cashier can pop /invoices/{token} in a
     *                       new tab and print without spamming an SMS.
     *
     * Invoice creation is idempotent (createFromOrderInternal returns the
     * existing row if one was already minted), so calling this multiple
     * times is safe.
     */
    public function sendBill(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $request->validate([
            'phone' => ['nullable', 'string', 'max:30', new MaldivesPhone],
        ]);

        $order = Order::with(['items.item', 'customer'])->findOrFail($id);
        $rawPhone = $request->input('phone');
        $phone = null;
        if ($rawPhone !== null && trim((string) $rawPhone) !== '') {
            $phone = MaldivesPhone::normalize((string) $rawPhone);

            // Phone provided → link the customer if the order isn't already
            // attached to one. We never overwrite an existing customer link
            // (cashier already chose who the order belongs to).
            $customer = Customer::firstOrCreate(
                ['phone' => $phone],
                ['loyalty_points' => 0, 'tier' => 'bronze'],
            );
            if (!$order->customer_id) {
                $order->update(['customer_id' => $customer->id]);
                $order->setRelation('customer', $customer);
            }
        } else {
            // No phone — fall back to the order's existing customer phone
            // if any, so loyalty/SMS log relations stay consistent.
            $phone = $order->customer?->phone;
        }

        // Repair zeroed order headers from line items, then mint/sync invoice.
        $order = app(\App\Domains\Orders\Services\OrderTotalsCalculator::class)
            ->repairZeroTotalFromItems($order);

        $invoice = app(InvoiceController::class)->createFromOrderInternal($order, $request->user());
        $invoice->loadMissing('items');
        $order->refresh()->loadMissing('items');

        $billTotal = $this->resolveBillTotalMvr($invoice, $order);
        if ($billTotal <= 0) {
            return response()->json([
                'message' => 'Cannot send bill — this order has no chargeable amount. Add items and save the ticket first.',
            ], 422);
        }

        // Persist a non-zero header on the invoice if it was still corrupted.
        if ((float) $invoice->total <= 0) {
            $invoice->update([
                'subtotal' => $billTotal,
                'subtotal_laar' => (int) round($billTotal * 100),
                'total' => $billTotal,
                'total_laar' => (int) round($billTotal * 100),
            ]);
            $invoice->refresh();
        }

        $link = rtrim(config('app.url'), '/') . '/invoices/' . $invoice->token;

        // SMS only fires when the caller explicitly passed a phone — keeps
        // the "Print bill" silent and prevents accidental double-SMS when
        // the cashier prints first and sends later.
        if (!empty($request->input('phone'))) {
            if (!SmsNotificationSettings::isEnabled(SmsNotificationSettings::POS_SEND_BILL)) {
                return response()->json(['message' => SmsNotificationSettings::DISABLED_MESSAGE], 422);
            }

            $fallback = 'Bill #' . $invoice->invoice_number . ' — MVR ' . number_format($billTotal, 2) . '. View: ' . $link;
            $message = app(CustomerSmsMessageBuilder::class)->build(
                CustomerSmsMessageBuilder::SLUG_SEND_BILL,
                [
                    'invoice_number' => (string) $invoice->invoice_number,
                    'total' => number_format($billTotal, 2),
                    'invoice_url' => $link,
                ],
                $fallback,
            );

            // Debounce only (~45s): cashiers need to resend after edits or
            // a failed delivery. A 24h same-total lock looked like "SMS
            // not received" when they tapped Send Bill again.
            $idempotencyKey = 'invoice:bill:' . $invoice->id
                . ':' . (int) round($billTotal * 100)
                . ':' . intdiv(now()->timestamp, 45);

            $smsLog = app(SmsService::class)->send(new SmsMessage(
                to: $phone,
                message: $message,
                type: 'transactional',
                referenceType: 'invoice',
                referenceId: (string) $invoice->id,
                idempotencyKey: $idempotencyKey,
            ));

            $invoice->update([
                'recipient_phone' => $phone,
                'status' => 'sent',
            ]);

            app(AuditLogService::class)->log('order.bill_sent', 'Order', $order->id, [], [
                'phone' => $phone,
                'invoice_id' => $invoice->id,
                'sms_status' => $smsLog->status,
                'bill_total' => $billTotal,
            ], [], $request);
        }

        return response()->json([
            'order' => $order->fresh('customer'),
            'invoice' => $invoice->fresh('items'),
            'link' => $link,
            'sms_status' => isset($smsLog) ? $smsLog->status : null,
            'bill_total' => round($billTotal, 2),
        ]);
    }

    /**
     * Resolve the amount that must appear on the bill SMS / public page.
     * Prefer authoritative order/invoice grand totals (post-discount + tax).
     * Line sums are a last-resort floor only — never a higher override.
     */
    private function resolveBillTotalMvr(Invoice $invoice, Order $order): float
    {
        $orderTotal = (float) $order->total;
        if ($orderTotal <= 0) {
            $orderTotal = round(((int) ($order->total_laar ?? 0)) / 100, 2);
        }
        if ($orderTotal > 0) {
            return round($orderTotal, 2);
        }

        $invoiceTotal = (float) $invoice->total;
        if ($invoiceTotal <= 0) {
            $invoiceTotal = round(((int) ($invoice->total_laar ?? 0)) / 100, 2);
        }
        if ($invoiceTotal > 0) {
            return round($invoiceTotal, 2);
        }

        // Last resort: line floor (pre-tax / may omit discounts) so SMS is never 0.
        $lineFloor = max(
            (float) $invoice->items->sum(fn ($i) => (float) $i->total),
            (float) $order->items->sum(function ($i) {
                $line = (float) ($i->total_price ?? 0);
                if ($line <= 0) {
                    $line = (float) ($i->unit_price ?? 0) * (float) ($i->quantity ?? 0);
                }

                return $line;
            }),
        );

        return round(max(0, $lineFloor), 2);
    }
}
