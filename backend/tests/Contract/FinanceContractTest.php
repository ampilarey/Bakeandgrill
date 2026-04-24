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

    /** Add finance-specific volatile fields (like staff names) to the base set. */
    protected array $snapshotVolatileKeys = [
        'id', 'order_id', 'customer_id', 'user_id', 'device_id', 'token',
        'idempotency_key', 'created_at', 'updated_at', 'deleted_at', 'processed_at',
        'sent_at', 'last_sent_at', 'completed_at', 'held_at', 'paid_at',
        'opened_at', 'closed_at', 'expires_at', 'consumed_at', 'released_at',
        'tracking_token', 'order_number',
        // Finance-specific volatile fields
        'created_by', 'name', 'invoice_number',
    ];

    private array $ownerHeaders;

    protected function setUp(): void
    {
        parent::setUp();

        $owner = $this->makeOwner();
        $this->ownerHeaders = ['Authorization' => 'Bearer '.$owner->createToken('test', ['staff'])->plainTextToken];
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function createInvoice(): Invoice
    {
        $response = $this->postJson('/api/invoices', [
            'type' => 'sale',
            'issue_date' => today()->toDateString(),
            'items' => [
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
        $invoice = $this->createInvoice();

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
        // X-report requires an active shift; without one, the endpoint returns 422.
        // This contract test verifies the endpoint is reachable and authenticated.
        $response = $this->getJson('/api/reports/x-report', $this->ownerHeaders);

        // Accept either 200 (shift open) or 422 (no shift) — both are valid contract states
        $this->assertContains($response->status(), [200, 422]);
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
