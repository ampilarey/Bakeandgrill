<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A combo is essentially an item marked as a bundle with child items
        Schema::create('combo_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('combo_id')->constrained('items')->cascadeOnDelete();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->unsignedTinyInteger('quantity')->default(1);
            $table->boolean('is_optional')->default(false);
            $table->timestamps();

            $table->unique(['combo_id', 'item_id']);
            $table->index('combo_id');
        });

        // Add is_combo flag to items
        Schema::table('items', function (Blueprint $table): void {
            $table->boolean('is_combo')->default(false)->after('is_available');
            $table->decimal('combo_discount_pct', 5, 2)->nullable()->after('is_combo');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table): void {
            $table->dropColumn(['is_combo', 'combo_discount_pct']);
        });
        Schema::dropIfExists('combo_items');
    }
};
