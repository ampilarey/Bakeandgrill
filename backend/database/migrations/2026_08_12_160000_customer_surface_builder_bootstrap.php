<?php

declare(strict_types=1);

use App\Domains\Content\Blocks\CustomerSurfaceMigrator;
use Illuminate\Database\Migrations\Migration;

/**
 * Customer Surface Builder — promote hard-coded chrome into explicit
 * page_blocks placements (prayer, trust, events, site footer, bottom nav).
 */
return new class extends Migration
{
    public function up(): void
    {
        CustomerSurfaceMigrator::migrate();
    }

    public function down(): void
    {
        // Non-destructive: leave promoted rows in place.
    }
};
