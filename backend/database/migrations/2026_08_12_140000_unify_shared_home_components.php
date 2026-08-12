<?php

declare(strict_types=1);

use App\Domains\Content\Blocks\SharedHomeComponentsMigrator;
use Illuminate\Database\Migrations\Migration;

/**
 * Promote injected / app-locked Home chrome into explicit page_blocks for both apps.
 * Idempotent. Preserves existing order and draft/publish history.
 */
return new class extends Migration
{
    public function up(): void
    {
        SharedHomeComponentsMigrator::migrate();
    }

    public function down(): void
    {
        // Non-destructive: leaving explicit blocks in place is safer than
        // re-introducing silent injection. Operators can hide unused rows.
    }
};
