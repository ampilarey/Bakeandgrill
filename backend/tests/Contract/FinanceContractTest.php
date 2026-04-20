<?php

declare(strict_types=1);

namespace Tests\Contract;

use App\Models\Invoice;
use Illuminate\Foundation\Testing\RefreshDatabase;

/**
 * Contract/snapshot tests for the finance API endpoints.
 *
 * Verifies response shapes for:
 *  - GET /api/invoices (list)
 *  - GET /api/invoices/{id} (detail)
 *  - GET /api/expenses (list)
 *  - GET /api/reports/x-report
 */
class FinanceContractTest extends ContractTestCase
{
    use RefreshDatabase;

    private array $ownerHeaders;

    protected function setUp(): void
    {
        parent::setUp();

        $owner             = $this->makeOwner();
        $this->ownerHeaders = ['Authorization' => 'Bearer ' . $owner->createToken('test', ['staff'])->plainTextToken];
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function createInvoice(): Invoice
    {
        $response = $this->postJson('/api/invoices', [
            'type'       => 'sale',
            'issue_date' => today()->toDateString(),
            'items'      => [
                ['description' => 'Meal', 'quantity' => 1, 'unit_price' => 20.00],
            ],
        ], $this->ownerHeaders)->assertStatus(201);

        return Invoice::find($response->json('invoice.id'));
    }

    // ── Invoice list ──────────────────────────────────────────────────────────

    public function test_invoice_list_response_shape(): void
    {
        $this->createInvoice();

        $response = $this->getJson('/api/invoices', $this->ownerHeaders)
            ->assertStatus(200);

        $this->assertMatchesApiSnapshot($response, 'finance.invoices.list');
    }

    // ── Invoice detail ────────────────────────────────────────────────────────

    public function test_invoice_detail_response_shape(): void
    {
        $invoice  = $this->createInvoice();

        $response = $this->getJson("/api/invoices/{$invoice->id}", $this->ownerHeaders)
            ->assertStatus(200);

        $this->assertMatchesApiSnapshot($response, 'finance.invoices.detail');
    }

    // ── Expenses list ─────────────────────────────────────────────────────────

    public function test_expenses_list_response_shape(): void
    {
        $response = $this->getJson('/api/expenses', $this->ownerHeaders)
            ->assertStatus(200);

        $this->assertMatchesApiSnapshot($response, 'finance.expenses.list');
    }

    // ── X-report ──────────────────────────────────────────────────────────────

    public function test_x_report_response_shape(): void
    {
        $response = $this->getJson('/api/reports/x-report', $this->ownerHeaders)
            ->assertStatus(200);

        $this->assertMatchesApiSnapshot($response, 'finance.x-report');
    }

    // ── Auth guard ────────────────────────────────────────────────────────────

    public function test_invoice_list_requires_auth(): void
    {
        $this->getJson('/api/invoices')->assertStatus(401);
    }

    public function test_expenses_list_requires_auth(): void
    {
        $this->getJson('/api/expenses')->assertStatus(401);
    }
}
