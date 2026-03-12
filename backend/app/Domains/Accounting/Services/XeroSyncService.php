<?php

declare(strict_types=1);

namespace App\Domains\Accounting\Services;

use App\Models\Invoice;
use App\Models\Expense;
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
            'Accept'         => 'application/json',
        ];
    }

    private function tenantId(): string
    {
        $conn = $this->oauth->getActiveConnection();
        if (!$conn) throw new \RuntimeException('Xero not connected.');
        return $conn->tenant_id;
    }

    /**
     * Push a local Invoice to Xero as an Invoice record.
     */
    public function pushInvoice(Invoice $invoice): void
    {
        $tenantId = $this->tenantId();
        $headers  = $this->headers($tenantId);

        $payload = [
            'Type'          => 'ACCREC',
            'Status'        => $invoice->status === 'paid' ? 'AUTHORISED' : 'DRAFT',
            'Reference'     => $invoice->invoice_number ?? "INV-{$invoice->id}",
            'Date'          => $invoice->issue_date,
            'DueDate'       => $invoice->due_date,
            'LineAmountTypes' => 'Inclusive',
            'LineItems'     => [
                [
                    'Description' => "Invoice {$invoice->invoice_number}",
                    'Quantity'    => 1,
                    'UnitAmount'  => ($invoice->total ?? 0) / 100,
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
            'resource_id'   => $invoice->id,
            'xero_id'       => $xeroId,
            'direction'     => 'push',
            'status'        => $response->successful() ? 'success' : 'failed',
            'error'         => $response->failed() ? $response->body() : null,
        ]);

        if ($response->failed()) {
            throw new \RuntimeException('Xero invoice push failed: ' . $response->body());
        }
    }

    /**
     * Push a local Expense to Xero as a BankTransaction or SpendMoney record.
     */
    public function pushExpense(Expense $expense): void
    {
        $tenantId = $this->tenantId();
        $headers  = $this->headers($tenantId);

        $payload = [
            'Type'          => 'SPEND',
            'Status'        => 'AUTHORISED',
            'Date'          => $expense->date ?? now()->toDateString(),
            'LineAmountTypes' => 'Inclusive',
            'BankAccount'   => ['Code' => config('services.xero.bank_account', '090')],
            'LineItems'     => [
                [
                    'Description' => $expense->description ?? "Expense #{$expense->id}",
                    'Quantity'    => 1,
                    'UnitAmount'  => ($expense->amount ?? 0) / 100,
                    'AccountCode' => config('services.xero.expense_account', '400'),
                ],
            ],
        ];

        $response = Http::withHeaders($headers)
            ->post(self::API_BASE . '/BankTransactions', ['BankTransactions' => [$payload]]);

        $xeroId = $response->json('BankTransactions.0.BankTransactionID') ?? null;

        XeroSyncLog::create([
            'resource_type' => 'expense',
            'resource_id'   => $expense->id,
            'xero_id'       => $xeroId,
            'direction'     => 'push',
            'status'        => $response->successful() ? 'success' : 'failed',
            'error'         => $response->failed() ? $response->body() : null,
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
