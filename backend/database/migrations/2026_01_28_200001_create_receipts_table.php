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
        Schema::create('receipts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->string('token')->unique();
            $table->string('channel')->default('email'); // email, sms
            $table->string('recipient')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->unsignedInteger('resend_count')->default(0);
            $table->timestamp('last_sent_at')->nullable();
            $table->timestamps();

            $table->unique('order_id');
            $table->index('token');
            $table->index('channel');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('receipts');
    }
};
