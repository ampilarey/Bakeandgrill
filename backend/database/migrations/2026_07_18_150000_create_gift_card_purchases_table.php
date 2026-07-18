<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gift_card_purchases', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->unique()->constrained('orders')->cascadeOnDelete();
            $table->foreignId('purchaser_customer_id')->constrained('customers')->cascadeOnDelete();
            $table->decimal('amount', 10, 2);
            $table->string('recipient_phone', 20)->nullable();
            $table->string('recipient_email', 200)->nullable();
            $table->string('personal_note', 500)->nullable();
            $table->foreignId('gift_card_id')->nullable()->constrained('gift_cards')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gift_card_purchases');
    }
};
