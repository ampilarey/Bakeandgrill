<?php

declare(strict_types=1);

use App\Domains\Content\Blocks\HomeLayoutMigrator;
use Illuminate\Database\Migrations\Migration;

/**
 * Stage B — seed page_blocks from the live home arrangements.
 * Idempotent via HomeLayoutMigrator::migrate(); reversible via reverse().
 */
return new class extends Migration
{
    public function up(): void
    {
        HomeLayoutMigrator::migrate();
    }

    public function down(): void
    {
        HomeLayoutMigrator::reverse();
    }
};
