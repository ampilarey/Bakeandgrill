<?php

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
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->string('method'); // cash, card, digital_wallet, gift_card, bank_transfer
            $table->decimal('amount', 10, 2)->default(0);
            $table->string('status')->default('pending');
            $table->string('reference_number')->nullable(); // Transaction ID from gateway
            $table->json('gateway_response')->nullable(); // Payment gateway response
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();
            
            $table->index('order_id');
            $table->index('method');
            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
