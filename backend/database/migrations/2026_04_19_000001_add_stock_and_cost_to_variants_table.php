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
            $table->decimal('cost', 10, 2)->nullable()->after('price');
            $table->boolean('track_stock')->default(false)->after('cost');
            $table->integer('stock_qty')->default(0)->after('track_stock');
        });
    }

    public function down(): void
    {
        Schema::table('variants', function (Blueprint $table): void {
            $table->dropColumn(['cost', 'track_stock', 'stock_qty']);
        });
    }
};
