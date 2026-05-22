<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domains\Permissions\PermissionCatalogSync;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    public function run(): void
    {
        PermissionCatalogSync::sync();
    }
}
