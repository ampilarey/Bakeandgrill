<?php

declare(strict_types=1);

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['owner', 'manager', 'staff'] as $slug) {
            Role::firstOrCreate(
                ['slug' => $slug],
                [
                    'name' => ucfirst($slug),
                    'description' => '',
                    'is_active' => true,
                ],
            );
        }

        PermissionCatalogSync::sync();
    }

    public function down(): void
    {
        // Permissions are additive — no destructive rollback.
    }
};
