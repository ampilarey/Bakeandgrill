<?php

declare(strict_types=1);

use App\Domains\Permissions\PermissionCatalogSync;
use Illuminate\Database\Migrations\Migration;

/**
 * Register the Social Hub permissions. social.view / compose / schedule /
 * publish are manager-grantable; social.channels.manage (tokens that post as
 * the business) is owner-only by default.
 */
return new class extends Migration
{
    public function up(): void
    {
        PermissionCatalogSync::sync();
    }

    public function down(): void
    {
        // Additive — the catalog keeps the slugs; no role rows are removed.
    }
};
