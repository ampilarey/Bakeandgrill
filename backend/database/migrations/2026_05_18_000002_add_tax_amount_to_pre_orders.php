<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // PreOrder totals previously skipped tax entirely. The
        // PreOrderController now computes per-item tax (same way the
        // regular order path does) so quoting matches the eventual
        // settled order. Persist the calculated tax so finance reports
        // and on-screen breakdowns can show it.
        Schema::table('pre_orders', function (Blueprint $table) {
            if (!Schema::hasColumn('pre_orders', 'tax_amount')) {
                $table->decimal('tax_amount', 10, 2)->default(0)->after('subtotal');
            }
        });
    }

    public function down(): void
    {
        Schema::table('pre_orders', function (Blueprint $table) {
            if (Schema::hasColumn('pre_orders', 'tax_amount')) {
                $table->dropColumn('tax_amount');
            }
        });
    }
};
