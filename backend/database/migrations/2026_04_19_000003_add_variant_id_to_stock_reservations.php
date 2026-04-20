<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_reservations', function (Blueprint $table): void {
            $table->foreignId('variant_id')
                ->nullable()
                ->after('item_id')
                ->constrained('variants')
                ->nullOnDelete();

            $table->index('variant_id');
        });
    }

    public function down(): void
    {
        Schema::table('stock_reservations', function (Blueprint $table): void {
            $table->dropForeign(['variant_id']);
            $table->dropIndex(['variant_id']);
            $table->dropColumn('variant_id');
        });
    }
};
