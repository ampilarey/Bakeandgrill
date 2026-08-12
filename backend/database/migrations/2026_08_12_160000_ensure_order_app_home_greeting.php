<?php

declare(strict_types=1);

use App\Domains\Content\Blocks\SharedHomeComponentsMigrator;
use Illuminate\Database\Migrations\Migration;

/**
 * Order App phone logo + Login live in the greeting block chrome.
 * Some layouts lost greeting after Home Components unification — restore it.
 */
return new class extends Migration
{
    public function up(): void
    {
        SharedHomeComponentsMigrator::migrate();
    }

    public function down(): void
    {
        // Non-destructive backfill; do not remove greeting on rollback.
    }
};
