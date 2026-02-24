<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('daily_sequences', function (Blueprint $table) {
            $table->id();
            $table->date('date')->unique(); // One row per day
            $table->unsignedInteger('last_order_number')->default(0);
            $table->timestamps();

            $table->index('date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_sequences');
    }
};
