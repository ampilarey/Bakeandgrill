<?php

declare(strict_types=1);

use App\Domains\Permissions\PermissionCatalogSync;
use Illuminate\Database\Migrations\Migration;

/**
 * Owner, 2026-09-01: cashiers must not see shift history (daily sales,
 * discounts, refunds). The staff role default loses shifts.view_own_history
 * and the finance.cash_manage alias no longer implies it — both changed in
 * PermissionCatalog; this resync applies the new defaults to the role rows.
 * Per-user overrides survive, so a trusted senior cashier can still be
 * granted history individually.
 */
return new class extends Migration
{
    public function up(): void
    {
        PermissionCatalogSync::sync();
    }

    public function down(): void
    {
        // Role defaults are derived from the catalog — nothing to restore.
    }
};
