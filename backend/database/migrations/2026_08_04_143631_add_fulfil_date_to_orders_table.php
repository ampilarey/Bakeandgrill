<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Collection date for "order for tomorrow".
 * Nullable on purpose: existing and same-day orders stay unchanged (null = today).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('orders')) {
            return;
        }

        Schema::table('orders', function (Blueprint $table) {
            if (!Schema::hasColumn('orders', 'fulfil_date')) {
                $table->date('fulfil_date')->nullable()->after('pickup_slot_at');
                $table->index('fulfil_date');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('orders') || !Schema::hasColumn('orders', 'fulfil_date')) {
            return;
        }

        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['fulfil_date']);
            $table->dropColumn('fulfil_date');
        });
    }
};
