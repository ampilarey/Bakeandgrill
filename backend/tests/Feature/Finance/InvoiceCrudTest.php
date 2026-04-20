<?php

declare(strict_types=1);

namespace Tests\Feature\Finance;

use App\Models\Invoice;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Invoice CRUD and lifecycle tests.
 *
 * Covers: create, update (draft only), void, credit-note, PDF generation,
 * and permission checks.
 */
class InvoiceCrudTest extends TestCase
{
    use RefreshDatabase;

    private array $ownerHeaders;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ownerHeaders = $this->staffHeaders($this->makeOwner());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function invoicePayload(array $overrides = []): array
    {
        return array_merge([
            'type'           => 'sale',
            'issue_date'     => today()->toDateString(),
            'recipient_name' => 'Test Customer',
            'items'          => [
                [
                    'description' => 'Grilled Chicken Meal',
                    'quantity'    => 2,
                    'unit_price'  => 15.00,
                ],
            ],
        ], $overrides);
    }

    // ── Create ────────────────────────────────────────────────────────────────

    public function test_owner_can_create_invoice(): void
    {
        $this->postJson('/api/invoices', $this->invoicePayload(), $this->ownerHeaders)
            ->assertStatus(201)
            ->assertJsonPath('invoice.type', 'sale')
            ->assertJsonPath('invoice.status', 'draft');
    }

    public function test_create_invoice_requires_auth(): void
    {
        $this->postJson('/api/invoices', $this->invoicePayload())
            ->assertStatus(401);
    }

    public function test_create_invoice_requires_at_least_one_line_item(): void
    {
        $this->postJson(
            '/api/invoices',
            $this->invoicePayload(['items' => []]),
            $this->ownerHeaders,
        )->assertStatus(422);
    }

    public function test_invoice_number_is_auto_generated(): void
    {
        $response = $this->postJson('/api/invoices', $this->invoicePayload(), $this->ownerHeaders)
            ->assertStatus(201);

        $number = $response->json('invoice.invoice_number');
        $this->assertNotNull($number);
        $this->assertNotEmpty($number);
    }

    public function test_invoice_total_matches_line_items(): void
    {
        $response = $this->postJson('/api/invoices', [
            'type'       => 'sale',
            'issue_date' => today()->toDateString(),
            'items'      => [
                ['description' => 'A', 'quantity' => 2, 'unit_price' => 10.00],
                ['description' => 'B', 'quantity' => 1, 'unit_price' => 5.00],
            ],
        ], $this->ownerHeaders)->assertStatus(201);

        $total = (float) $response->json('invoice.total');
        $this->assertEqualsWithDelta(25.00, $total, 0.01);
    }

    // ── Update ────────────────────────────────────────────────────────────────

    public function test_owner_can_update_draft_invoice(): void
    {
        $invoice = $this->createDraftInvoice();

        $this->patchJson(
            "/api/invoices/{$invoice->id}",
            ['recipient_name' => 'Updated Name', 'notes' => 'Test note'],
            $this->ownerHeaders,
        )->assertStatus(200)
        ->assertJsonPath('invoice.recipient_name', 'Updated Name');
    }

    public function test_cannot_update_non_draft_invoice(): void
    {
        $invoice = $this->createDraftInvoice();
        $invoice->update(['status' => 'sent']);

        $this->patchJson(
            "/api/invoices/{$invoice->id}",
            ['recipient_name' => 'New Name'],
            $this->ownerHeaders,
        )->assertStatus(422);
    }

    // ── Void ─────────────────────────────────────────────────────────────────

    public function test_owner_can_void_an_invoice(): void
    {
        $invoice = $this->createDraftInvoice();

        $this->postJson("/api/invoices/{$invoice->id}/void", [], $this->ownerHeaders)
            ->assertStatus(200)
            ->assertJsonPath('invoice.status', 'void');
    }

    public function test_cannot_void_already_void_invoice(): void
    {
        $invoice = $this->createDraftInvoice();
        $invoice->update(['status' => 'void']);

        $this->postJson("/api/invoices/{$invoice->id}/void", [], $this->ownerHeaders)
            ->assertStatus(422);
    }

    // ── Credit note ───────────────────────────────────────────────────────────

    public function test_credit_note_can_be_created_against_invoice(): void
    {
        $invoice = $this->createDraftInvoice();
        $invoice->update(['status' => 'sent']);

        $response = $this->postJson(
            "/api/invoices/{$invoice->id}/credit-note",
            [
                'reason' => 'Customer returned item',
                'items'  => [
                    ['description' => 'Return: Grilled Chicken', 'quantity' => 1, 'unit_price' => 15.00],
                ],
            ],
            $this->ownerHeaders,
        )->assertStatus(201);

        $this->assertEquals('credit_note', $response->json('credit_note.type'));
        $this->assertEquals($invoice->id, $response->json('credit_note.parent_invoice_id'));
    }

    // ── PDF generation ────────────────────────────────────────────────────────

    public function test_pdf_generation_returns_success(): void
    {
        $invoice = $this->createDraftInvoice();

        // PDF endpoint returns a file or a JSON with pdf_url / pdf_path
        $response = $this->get(
            "/api/invoices/{$invoice->id}/pdf",
            $this->ownerHeaders,
        );

        // Accept 200 (PDF blob) or 200 (JSON with path) — just assert it doesn't error
        $this->assertContains($response->status(), [200, 201, 302]);
    }

    // ── List ──────────────────────────────────────────────────────────────────

    public function test_invoice_list_returns_paginated_data(): void
    {
        $this->createDraftInvoice();
        $this->createDraftInvoice();

        $response = $this->getJson('/api/invoices', $this->ownerHeaders)
            ->assertStatus(200);

        $this->assertArrayHasKey('data', $response->json());
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private function createDraftInvoice(): Invoice
    {
        $response = $this->postJson(
            '/api/invoices',
            $this->invoicePayload(),
            $this->ownerHeaders,
        )->assertStatus(201);

        return Invoice::find($response->json('invoice.id'));
    }
}
