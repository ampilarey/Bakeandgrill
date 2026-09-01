<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Sold out today" for one size.
 *
 * Owner, 2026-09-01: in the quick-edit grid the availability cell on a size
 * row said "follows item" — "it should be independent for each variant".
 *
 * Sizes already had `is_active`, but that is the permanent switch: it takes
 * the option off the menu entirely. Running out of large cups at lunch is the
 * other kind of unavailable — the one that comes back tomorrow and that
 * customers should still see, greyed out, so they know it normally exists.
 * Items have had that switch since the beginning; sizes never did.
 *
 * Defaults to true so every existing size stays sellable.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('variants', 'is_available')) {
            Schema::table('variants', function (Blueprint $table): void {
                $table->boolean('is_available')->default(true)->after('is_active');
                $table->index(['item_id', 'is_available']);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('variants', 'is_available')) {
            Schema::table('variants', function (Blueprint $table): void {
                $table->dropIndex(['item_id', 'is_available']);
                $table->dropColumn('is_available');
            });
        }
    }
};
