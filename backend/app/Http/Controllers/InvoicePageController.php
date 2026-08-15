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
