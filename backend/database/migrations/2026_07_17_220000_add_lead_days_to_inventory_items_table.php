<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->unsignedTinyInteger('lead_days')->nullable()->after('reorder_quantity');
        });
    }

    public function down(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->dropColumn('lead_days');
        });
    }
};
