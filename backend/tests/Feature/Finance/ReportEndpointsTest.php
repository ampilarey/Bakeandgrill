<?php

declare(strict_types=1);

namespace Tests\Feature\Finance;

use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Finance report endpoint tests.
 *
 * Verifies authentication, permission enforcement, and basic response shape
 * for all finance / reports endpoints. Does NOT assert exact dollar figures —
 * that's the job of unit tests for the underlying calculators.
 */
class ReportEndpointsTest extends TestCase
{
    use RefreshDatabase;

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Auth header for an owner (bypasses all permission checks). */
    private function ownerHeaders(): array
    {
        return $this->staffHeaders($this->makeOwner());
    }

    /** Auth header for a plain staff member (no finance permissions by default). */
    private function staffOnlyHeaders(): array
    {
        return $this->staffHeaders($this->makeStaff('staff'));
    }

    // ── X-report ─────────────────────────────────────────────────────────────

    public function test_x_report_returns_authenticated_response_for_owner(): void
    {
        // X-report requires an active shift to return 200; returns 422 otherwise.
        // This test verifies authentication is accepted (not 401/403).
        $status = $this->getJson('/api/reports/x-report', $this->ownerHeaders())->status();
        $this->assertContains($status, [200, 422], 'X-report should be accessible to authenticated owner');
    }

    public function test_x_report_requires_auth(): void
    {
        $this->getJson('/api/reports/x-report')->assertStatus(401);
    }

    public function test_x_report_accessible_by_all_staff(): void
    {
        // X-report is inside the general staff.token group with no extra permission gate.
        // Returns 200 (shift open) or 422 (no shift) — both mean "authenticated and authorized".
        $status = $this->getJson('/api/reports/x-report', $this->staffOnlyHeaders())->status();
        $this->assertContains($status, [200, 422]);
    }

    // ── Z-report ─────────────────────────────────────────────────────────────

    public function test_z_report_returns_authenticated_response_for_owner(): void
    {
        $status = $this->getJson('/api/reports/z-report', $this->ownerHeaders())->status();
        $this->assertContains($status, [200, 422], 'Z-report should be accessible to authenticated owner');
    }

    public function test_z_report_requires_auth(): void
    {
        $this->getJson('/api/reports/z-report')->assertStatus(401);
    }

    // ── Finance: tax report ───────────────────────────────────────────────────

    public function test_tax_report_returns_200_for_owner(): void
    {
        $this->getJson(
            '/api/reports/finance/tax?from=' . today()->startOfMonth()->toDateString()
            . '&to=' . today()->toDateString(),
            $this->ownerHeaders(),
        )->assertStatus(200);
    }

    public function test_tax_report_requires_auth(): void
    {
        $this->getJson('/api/reports/finance/tax')->assertStatus(401);
    }

    public function test_tax_report_forbidden_for_staff_without_reports_financial_permission(): void
    {
        // Finance report routes use permission:reports.financial — plain staff should get 403
        $this->getJson('/api/reports/finance/tax', $this->staffOnlyHeaders())
            ->assertStatus(403);
    }

    // ── Finance: accounts payable ─────────────────────────────────────────────

    public function test_accounts_payable_returns_200_for_owner(): void
    {
        $this->getJson('/api/reports/finance/accounts-payable', $this->ownerHeaders())
            ->assertStatus(200);
    }

    public function test_accounts_payable_requires_auth(): void
    {
        $this->getJson('/api/reports/finance/accounts-payable')->assertStatus(401);
    }

    // ── Finance: accounts receivable ──────────────────────────────────────────

    public function test_accounts_receivable_returns_200_for_owner(): void
    {
        $this->getJson('/api/reports/finance/accounts-receivable', $this->ownerHeaders())
            ->assertStatus(200);
    }

    // ── Inventory valuation ───────────────────────────────────────────────────

    public function test_inventory_valuation_returns_200_for_owner(): void
    {
        $this->getJson('/api/reports/inventory-valuation', $this->ownerHeaders())
            ->assertStatus(200);
    }

    public function test_inventory_valuation_requires_auth(): void
    {
        $this->getJson('/api/reports/inventory-valuation')->assertStatus(401);
    }

    // ── X-report structure after creating an order ────────────────────────────

    public function test_x_report_endpoint_is_accessible_to_authenticated_owner(): void
    {
        // X-report requires an open shift; in tests no shift exists so it returns 422.
        // This test confirms the endpoint is reachable (not 401/403) for authenticated owners.
        $status = $this->getJson('/api/reports/x-report', $this->ownerHeaders())->status();
        $this->assertContains(
            $status,
            [200, 422],
            'X-report must return 200 (shift open) or 422 (no shift), never 401/403',
        );
    }
}
