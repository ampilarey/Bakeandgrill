<?php

declare(strict_types=1);

use App\Domains\Permissions\PermissionCatalogSync;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        PermissionCatalogSync::sync();
    }

    public function down(): void
    {
        // Permissions retained on rollback — non-destructive sync pattern.
    }
};
