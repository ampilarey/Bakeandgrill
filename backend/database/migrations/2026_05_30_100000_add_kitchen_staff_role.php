<?php

declare(strict_types=1);

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        Role::updateOrCreate(
            ['slug' => 'kitchen_staff'],
            [
                'name' => 'Kitchen Staff',
                'description' => 'Kitchen/KDS staff with preparation-only access',
                'is_active' => true,
            ],
        );

        Role::whereIn('slug', ['admin', 'cashier'])->delete();

        PermissionCatalogSync::sync();
    }

    public function down(): void
    {
        Role::where('slug', 'kitchen_staff')->delete();
    }
};
