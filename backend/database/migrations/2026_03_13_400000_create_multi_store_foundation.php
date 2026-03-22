<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Multi-store foundation.
 * Adds a `stores` table and seeds a default store.
 * Adds nullable `store_id` to key operational tables so existing data is unaffected.
 * A follow-up migration (when multi-store is actually activated) will make store_id required.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('stores')) {
            Schema::create('stores', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('slug')->unique();
                $table->string('phone')->nullable();
                $table->string('address')->nullable();
                $table->boolean('is_active')->default(true);
                $table->json('settings')->nullable();
                $table->timestamps();
            });

            // Seed default store so FK can be back-filled later
            DB::table('stores')->insert([
                'name'       => 'Bake & Grill Main',
                'slug'       => 'main',
                'is_active'  => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // Add nullable store_id to operational tables
        $tables = ['orders', 'shifts', 'users', 'inventory_items', 'items'];
        foreach ($tables as $t) {
            if (Schema::hasTable($t) && !Schema::hasColumn($t, 'store_id')) {
                Schema::table($t, function (Blueprint $table) {
                    $table->foreignId('store_id')->nullable()->after('id')
                        ->constrained('stores')->nullOnDelete();
                });
            }
        }
    }

    public function down(): void
    {
        $tables = ['orders', 'shifts', 'users', 'inventory_items', 'items'];
        foreach ($tables as $t) {
            if (Schema::hasTable($t) && Schema::hasColumn($t, 'store_id')) {
                Schema::table($t, function (Blueprint $table) {
                    $table->dropForeign(['store_id']);
                    $table->dropColumn('store_id');
                });
            }
        }
        Schema::dropIfExists('stores');
    }
};
