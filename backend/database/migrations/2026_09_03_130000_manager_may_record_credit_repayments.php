<?php

declare(strict_types=1);

use App\Domains\Permissions\PermissionCatalogSync;
use Illuminate\Database\Migrations\Migration;

/**
 * Credit settings audit, 2026-09-03 (F2) — the owner's decision.
 *
 * A manager could approve a credit account and raise its limit, but not take
 * the customer's payment against it: `customers.credit.repay` was owner-only.
 * At the counter that made the owner a bottleneck — a customer settling their
 * account had to wait, or the money went in as something else.
 *
 * Money IN is the reconcilable direction. A repayment writes a CashMovement
 * into the taker's shift, so a false one shows up as a short drawer at close,
 * and every one is audited. Writing a balance OFF — money out, no cash trail —
 * remains owner-only.
 *
 * The catalog is the source of truth; this re-sync is what hands the manager
 * role the permission on deploy.
 */
return new class extends Migration
{
    public function up(): void
    {
        PermissionCatalogSync::sync();
    }

    public function down(): void
    {
        // Reversing means editing PermissionCatalog back and re-syncing; a
        // blind sync here would re-grant whatever the catalog then said.
    }
};
