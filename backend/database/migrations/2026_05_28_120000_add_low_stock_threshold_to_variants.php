<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('variants', function (Blueprint $table): void {
            $table->unsignedInteger('low_stock_threshold')->default(5)->after('stock_qty');
        });

        Schema::table('low_stock_alerts', function (Blueprint $table): void {
            $table->foreignId('variant_id')->nullable()->after('item_id')->constrained()->nullOnDelete();
            $table->index(['variant_id', 'sent']);
        });
    }

    public function down(): void
    {
        Schema::table('low_stock_alerts', function (Blueprint $table): void {
            $table->dropForeign(['variant_id']);
            $table->dropIndex(['variant_id', 'sent']);
            $table->dropColumn('variant_id');
        });

        Schema::table('variants', function (Blueprint $table): void {
            $table->dropColumn('low_stock_threshold');
        });
    }
};
