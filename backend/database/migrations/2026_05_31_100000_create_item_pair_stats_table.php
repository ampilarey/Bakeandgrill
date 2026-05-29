<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('item_pair_stats', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->foreignId('paired_item_id')->constrained('items')->cascadeOnDelete();
            $table->unsignedInteger('pair_count')->default(0);
            $table->timestamp('computed_at');
            $table->timestamps();

            $table->unique(['item_id', 'paired_item_id']);
            $table->index(['item_id', 'pair_count']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_pair_stats');
    }
};
