<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('daily_specials', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->string('badge_label', 60)->nullable();
            $table->decimal('special_price', 10, 2)->nullable();
            $table->unsignedSmallInteger('discount_pct')->nullable();
            $table->date('start_date');
            $table->date('end_date');
            $table->time('start_time')->nullable();
            $table->time('end_time')->nullable();
            $table->json('days_of_week')->nullable(); // [0,1,2,...6] — null = every day
            $table->unsignedSmallInteger('max_quantity')->nullable();
            $table->unsignedSmallInteger('sold_count')->default(0);
            $table->boolean('is_active')->default(true);
            $table->text('description')->nullable();
            $table->timestamps();

            $table->index(['start_date', 'end_date', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_specials');
    }
};
