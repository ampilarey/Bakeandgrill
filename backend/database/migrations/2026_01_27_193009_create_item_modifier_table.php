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
        Schema::create('item_modifier', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->foreignId('modifier_id')->constrained('modifiers')->cascadeOnDelete();
            $table->boolean('is_required')->default(false);
            $table->integer('max_quantity')->default(1);
            $table->timestamps();

            $table->unique(['item_id', 'modifier_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('item_modifier');
    }
};
