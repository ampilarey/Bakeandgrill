<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tracks individual BML gateway initiation attempts per payment.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_attempts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('payment_id')->constrained()->cascadeOnDelete();
            $table->string('local_id');
            $table->string('status');
            $table->json('gateway_request')->nullable();
            $table->json('gateway_response')->nullable();
            $table->string('error_message')->nullable();
            $table->timestamp('attempted_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_attempts');
    }
};
