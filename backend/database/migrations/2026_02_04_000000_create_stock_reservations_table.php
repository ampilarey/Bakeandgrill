<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('stock_reservations');
        Schema::create('stock_reservations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained()->cascadeOnDelete();
            $table->string('session_id')->index();
            $table->integer('quantity');
            $table->timestamp('expires_at')->index();
            $table->timestamps();

            $table->index(['item_id', 'expires_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_reservations');
    }
};
