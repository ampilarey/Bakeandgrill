<?php

declare(strict_types=1);

use App\Domains\Content\Blocks\CustomerSurfaceMigrator;
use Illuminate\Database\Migrations\Migration;

/**
 * Ensure the marketing website home has order mode cards (hero → mode_cards → trust),
 * matching the order-app mobile home entry.
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
