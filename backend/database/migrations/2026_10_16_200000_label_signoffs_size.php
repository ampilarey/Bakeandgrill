<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sign-off per size (label audit, 2026-10-16): a size with a recipe of its
 * own has ingredients of its own, so its legal lines are signed off apart
 * from the item's. Null is the item itself (and every size that shares its
 * recipe), so the sign-offs kept so far stand as they are.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('label_signoffs', 'size_id')) {
            return;
        }
        Schema::table('label_signoffs', function (Blueprint $table): void {
            $table->unsignedBigInteger('size_id')->nullable()->after('product_id');
            $table->index(['kind', 'product_id', 'size_id', 'id'], 'label_signoffs_size_idx');
        });
    }

    public function down(): void
    {
        if (!Schema::hasColumn('label_signoffs', 'size_id')) {
            return;
        }
        Schema::table('label_signoffs', function (Blueprint $table): void {
            $table->dropIndex('label_signoffs_size_idx');
            $table->dropColumn('size_id');
        });
    }
};
