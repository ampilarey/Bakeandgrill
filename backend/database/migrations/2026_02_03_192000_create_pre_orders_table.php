<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pre_orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_number')->unique();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->string('customer_name');
            $table->string('customer_phone');
            $table->string('customer_email')->nullable();

            $table->dateTime('fulfillment_date'); // When customer wants it
            $table->dateTime('preparation_start')->nullable(); // When to start preparing

            $table->json('items'); // [{item_id, name, quantity, price, notes}]
            $table->decimal('subtotal', 10, 2);
            $table->decimal('total', 10, 2);

            $table->enum('status', [
                'pending',      // Awaiting approval
                'approved',     // Manager approved
                'confirmed',    // Customer confirmed
                'preparing',    // Being prepared
                'ready',        // Ready for pickup
                'completed',    // Picked up
                'cancelled',     // Cancelled
            ])->default('pending');

            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();

            $table->text('customer_notes')->nullable();
            $table->text('staff_notes')->nullable();
            $table->text('cancellation_reason')->nullable();

            $table->timestamps();

            $table->index('fulfillment_date');
            $table->index('status');
            $table->index('customer_phone');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pre_orders');
    }
};
