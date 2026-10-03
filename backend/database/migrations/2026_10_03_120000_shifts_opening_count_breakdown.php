<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Owner, 2026-10-03: "in shift opening also add the shift-closing type of
 * money counting." The opening float can now be counted note by note, the
 * same way the drawer is counted at close; this keeps that breakdown.
 * Nullable: shifts opened before this, and plain-total opens, have none.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shifts', function (Blueprint $table): void {
            $table->string('opening_count_method', 32)->nullable()->after('opening_float_variance');
            $table->json('opening_count_breakdown')->nullable()->after('opening_count_method');
        });
    }

    public function down(): void
    {
        Schema::table('shifts', function (Blueprint $table): void {
            $table->dropColumn(['opening_count_method', 'opening_count_breakdown']);
        });
    }
};
