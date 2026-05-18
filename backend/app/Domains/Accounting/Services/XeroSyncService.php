<?php

declare(strict_types=1);

namespace App\Domains\Accounting\Services;

use App\Models\Expense;
use App\Models\Invoice;
use App\Models\XeroSyncLog;
use Illuminate\Support\Facades\Http;

class XeroSyncService
{
    private const API_BASE = 'https://api.xero.com/api.xro/2.0';

    public function __construct(private XeroOAuthService $oauth) {}

    private function headers(string $tenantId): array
    {
        return [
            'Authorization' => 'Bearer ' . $this->oauth->getFreshToken(),
            'Xero-tenant-id' => $tenantId,
            'Accept' => 'application/json',
        ];
    }

    private function tenantId(): string
    {
        $conn = $this->oauth->getActiveConnection();
        if (!$conn) {
            throw new \RuntimeException('Xero not connected.');
        }

        return $conn->tenant_id;
    }

    /**
     * Push a local Invoice to Xero as an Invoice record.
     *
     * Idempotent: if a prior successful push already produced a Xero ID for
     * this invoice, the call is a no-op. This protects against retries
     * (queue jobs, manual button mashes, listener replays) creating
     * duplicate AR documents in Xero — there's no native dedupe key on the
     * Xero side once it's accepted.
     */
    public function pushInvoice(Invoice $invoice): void
    {
        $existing = XeroSyncLog::where('resource_type', 'invoice')
            ->where('resource_id', $invoice->id)
            ->where('direction', 'push')
            ->where('status', 'success')
            ->whereNotNull('xero_id')
            ->first();

        if ($existing) {
            return; // already pushed — do not double-create in Xero
        }

        $tenantId = $this->tenantId();
        $headers = $this->headers($tenantId);

        // Invoices store `total` as decimal MVR (e.g. 50.00 = 50 MVR).
        // Xero expects the same decimal unit on UnitAmount — do NOT divide by 100.
        // Bug history: this previously did `($invoice->total ?? 0) / 100` which
        // pushed a 50 MVR invoice into Xero as 0.50.
        $payload = [
            'Type' => 'ACCREC',
            'Status' => $invoice->status === 'paid' ? 'AUTHORISED' : 'DRAFT',
            'Reference' => $invoice->invoice_number ?? "INV-{$invoice->id}",
            'Date' => $invoice->issue_date,
            'DueDate' => $invoice->due_date,
            'LineAmountTypes' => 'Inclusive',
            'LineItems' => [
                [
                    'Description' => "Invoice {$invoice->invoice_number}",
                    'Quantity' => 1,
                    'UnitAmount' => (float) ($invoice->total ?? 0),
                    'AccountCode' => config('services.xero.revenue_account', '200'),
                ],
            ],
        ];

        if ($invoice->customer_name) {
            $payload['Contact'] = ['Name' => $invoice->customer_name];
        }

        $response = Http::withHeaders($headers)
            ->post(self::API_BASE . '/Invoices', ['Invoices' => [$payload]]);

        $xeroId = $response->json('Invoices.0.InvoiceID') ?? null;

        XeroSyncLog::create([
            'resource_type' => 'invoice',
            'resource_id' => $invoice->id,
            'xero_id' => $xeroId,
            'direction' => 'push',
            'status' => $response->successful() ? 'success' : 'failed',
            'error' => $response->failed() ? $response->body() : null,
        ]);

        if ($response->failed()) {
            throw new \RuntimeException('Xero invoice push failed: ' . $response->body());
        }
    }

    /**
     * Push a local Expense to Xero as a BankTransaction or SpendMoney record.
     *
     * Idempotent: see pushInvoice() for rationale. Once a Xero bank
     * transaction ID has been recorded, subsequent pushes are no-ops.
     */
    public function pushExpense(Expense $expense): void
    {
        $existing = XeroSyncLog::where('resource_type', 'expense')
            ->where('resource_id', $expense->id)
            ->where('direction', 'push')
            ->where('status', 'success')
            ->whereNotNull('xero_id')
            ->first();

        if ($existing) {
            return;
        }

        $tenantId = $this->tenantId();
        $headers = $this->headers($tenantId);

        // Expenses store `amount` as decimal MVR — same as invoices. See note
        // on pushInvoice() for the historical /100 scaling bug.
        $payload = [
            'Type' => 'SPEND',
            'Status' => 'AUTHORISED',
            'Date' => $expense->date ?? now()->toDateString(),
            'LineAmountTypes' => 'Inclusive',
            'BankAccount' => ['Code' => config('services.xero.bank_account', '090')],
            'LineItems' => [
                [
                    'Description' => $expense->description ?? "Expense #{$expense->id}",
                    'Quantity' => 1,
                    'UnitAmount' => (float) ($expense->amount ?? 0),
                    'AccountCode' => config('services.xero.expense_account', '400'),
                ],
            ],
        ];

        $response = Http::withHeaders($headers)
            ->post(self::API_BASE . '/BankTransactions', ['BankTransactions' => [$payload]]);

        $xeroId = $response->json('BankTransactions.0.BankTransactionID') ?? null;

        XeroSyncLog::create([
            'resource_type' => 'expense',
            'resource_id' => $expense->id,
            'xero_id' => $xeroId,
            'direction' => 'push',
            'status' => $response->successful() ? 'success' : 'failed',
            'error' => $response->failed() ? $response->body() : null,
        ]);

        if ($response->failed()) {
            throw new \RuntimeException('Xero expense push failed: ' . $response->body());
        }
    }

    public function getSyncLogs(int $limit = 50): array
    {
        return XeroSyncLog::orderByDesc('created_at')->limit($limit)->get()->toArray();
    }
}
