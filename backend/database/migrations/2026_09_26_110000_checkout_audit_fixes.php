<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Checkout audit, 2026-09-26: a paid pickup or dine-in order the kitchen has
 * not started texts the owners once (`unstarted_alerted_at`). The delivery
 * minimum order and the other fixes need no schema.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->timestamp('unstarted_alerted_at')->nullable()->after('paid_at');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropColumn('unstarted_alerted_at');
        });
    }
};
