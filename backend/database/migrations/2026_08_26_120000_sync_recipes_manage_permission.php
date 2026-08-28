<?php

declare(strict_types=1);

use App\Domains\Permissions\PermissionCatalogSync;
use Illuminate\Database\Migrations\Migration;

/**
 * Register the new recipes.manage permission and grant it to the owner role.
 *
 * Owner-only by design: it is defined in the catalog (so ownerSlugs() picks it
 * up automatically) but left off the manager allowlist, so recording recipes
 * and seeing item cost / margin / profit stays with the owner unless granted
 * explicitly.
 */
return new class extends Migration
{
    public function up(): void
    {
        PermissionCatalogSync::sync();
    }

    public function down(): void
    {
        // Additive — the catalog keeps the slug; no role rows are removed.
    }
};
