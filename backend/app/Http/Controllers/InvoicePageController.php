<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Controllers\Api\InvoiceController;
use App\Models\Invoice;
use App\Support\InvoicePagePresenter;
use Barryvdh\DomPDF\Facade\Pdf;

class InvoicePageController extends Controller
{
    public function show(string $token)
    {
        $invoice = $this->loadAndHeal($token);
        $page = InvoicePagePresenter::present($invoice);

        return response()
            ->view('invoice', [
                'invoice' => $invoice,
                'page' => $page,
            ])
            ->header('Cache-Control', 'private, max-age=15, must-revalidate');
    }

    /**
     * POST /invoices/{token}/pay — start a card payment for a customer's
     * credit invoice and send them to the gateway. The page's Pay button
     * (InvoicePagePresenter::payCta, kind "credit"). Token-gated like the
     * page itself; the gateway brings them back here.
     */
    public function pay(string $token, \App\Domains\Payments\Services\PaymentService $payments)
    {
        $invoice = $this->loadAndHeal($token);
        if (!\App\Domains\Credit\Services\CreditOnlinePaymentService::isCreditInvoice($invoice) || $invoice->balanceDueLaar() <= 0) {
            return redirect()->route('invoices.show', $token)->with('error', 'This invoice cannot be paid online.');
        }

        try {
            app(\App\Domains\System\Services\ServiceAvailabilityService::class)->assertAvailable('online_payment');
            $result = $payments->initiateBmlInvoicePayment(
                $invoice,
                null,
                null,
                route('bml.return', ['invoiceId' => $invoice->id, 'invoiceToken' => $invoice->token]),
            );
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Credit invoice pay link: gateway unavailable', ['invoice_id' => $invoice->id, 'error' => $e->getMessage()]);

            return redirect()->route('invoices.show', $token)->with('error', 'Online payment is not available right now. Please try again shortly.');
        }

        if (($result['reused'] ?? false) && ($result['payment_url'] ?? '') === '') {
            return redirect()->route('invoices.show', $token)->with('success', 'This invoice is already paid.');
        }

        return redirect()->away((string) $result['payment_url']);
    }

    public function pdf(string $token)
    {
        $invoice = $this->loadAndHeal($token);

        $pdf = Pdf::loadView('invoice-pdf', ['invoice' => $invoice]);

        return $pdf->stream('invoice-' . $invoice->invoice_number . '.pdf');
    }

    /**
     * Heal sale invoices that were paid on the order but never marked paid
     * on the invoice row (pre-sync bug). Credit invoices are left alone.
     */
    private function loadAndHeal(string $token): Invoice
    {
        $with = [
            'items',
            'order.items',
            'order.payments',
            'customer',
            'payments',
            'creditNotes',
            'tradeAllocations.deliveryLine.delivery',
            'tradeAllocations.deliveryLine.item',
        ];

        $invoice = Invoice::with($with)
            ->where('token', $token)
            ->firstOrFail();

        if (
            $invoice->order
            && $invoice->type === 'sale'
            && ! in_array($invoice->status, ['paid', 'void', 'cancelled'], true)
            && ! $invoice->isOnCreditAccount()
        ) {
            $order = $invoice->order;
            $orderLooksPaid = $order->payment_status === 'paid'
                || $order->paid_at !== null
                || in_array($order->status, ['paid', 'completed'], true);
            $hasCollectedPayments = $order->payments->contains(
                fn ($p) => in_array((string) ($p->status ?? ''), ['paid', 'completed', 'confirmed'], true),
            );

            if ($orderLooksPaid || $hasCollectedPayments) {
                app(InvoiceController::class)->syncPaymentStateFromOrder($order);
                $invoice = Invoice::with($with)
                    ->where('token', $token)
                    ->firstOrFail();
            }
        }

        return $invoice;
    }
}
