<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasTable('recipes') || !Schema::hasColumn('recipe_items', 'recipe_id')) {
            return;
        }

        Schema::table('recipe_items', function (Blueprint $table) {
            $table->foreign('recipe_id')
                ->references('id')
                ->on('recipes')
                ->cascadeOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasTable('recipe_items') || !Schema::hasColumn('recipe_items', 'recipe_id')) {
            return;
        }

        Schema::table('recipe_items', function (Blueprint $table) {
            $table->dropForeign(['recipe_id']);
        });
    }
};
