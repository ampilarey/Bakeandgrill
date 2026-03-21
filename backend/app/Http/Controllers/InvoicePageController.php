<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Invoice;
use Barryvdh\DomPDF\Facade\Pdf;

class InvoicePageController extends Controller
{
    public function show(string $token)
    {
        $invoice = Invoice::with(['items', 'order.items', 'customer'])
            ->where('token', $token)
            ->firstOrFail();

        return view('invoice', ['invoice' => $invoice]);
    }

    public function pdf(string $token)
    {
        $invoice = Invoice::with(['items', 'order.items', 'customer'])
            ->where('token', $token)
            ->firstOrFail();

        $pdf = Pdf::loadView('invoice-pdf', ['invoice' => $invoice]);

        return $pdf->stream('invoice-' . $invoice->invoice_number . '.pdf');
    }
}
