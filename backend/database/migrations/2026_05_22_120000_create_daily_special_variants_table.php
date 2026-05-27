<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('daily_special_variants', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('daily_special_id')->constrained('daily_specials')->cascadeOnDelete();
            $table->foreignId('variant_id')->constrained('variants')->cascadeOnDelete();
            $table->unsignedSmallInteger('discount_pct')->nullable();
            $table->decimal('special_price', 10, 2)->nullable();
            $table->timestamps();

            $table->unique(['daily_special_id', 'variant_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_special_variants');
    }
};
