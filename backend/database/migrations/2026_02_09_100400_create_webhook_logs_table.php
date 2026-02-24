<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stores raw incoming webhook payloads from BML (and any future gateways).
 * Idempotency via unique (gateway, gateway_event_id).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('webhook_logs', function (Blueprint $table): void {
            $table->id();
            $table->string('idempotency_key')->unique();
            $table->string('gateway');
            $table->string('gateway_event_id')->nullable();
            $table->string('event_type')->nullable();
            $table->json('headers')->nullable();
            $table->longText('raw_body');
            $table->json('payload')->nullable();
            $table->string('status')->default('received');
            $table->string('error_message')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();

            $table->index(['gateway', 'gateway_event_id']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('webhook_logs');
    }
};
