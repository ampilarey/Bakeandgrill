<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('recipe_items', 'unit')) {
            Schema::table('recipe_items', function (Blueprint $table) {
                $table->string('unit', 20)->nullable()->after('quantity');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('recipe_items', 'unit')) {
            Schema::table('recipe_items', function (Blueprint $table) {
                $table->dropColumn('unit');
            });
        }
    }
};
