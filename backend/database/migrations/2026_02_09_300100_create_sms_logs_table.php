<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sms_logs', function (Blueprint $table): void {
            $table->id();

            // Message
            $table->text('message');
            $table->string('to', 20);               // Normalised phone e.g. +9607654321
            $table->string('type', 50);             // otp | promotion | campaign | transactional

            // Status
            $table->string('status', 20)->default('queued'); // queued | sent | failed | demo

            // SMS encoding / cost (from Akuru pattern)
            $table->string('encoding', 10)->default('gsm7'); // gsm7 | ucs2
            $table->unsignedTinyInteger('segments')->default(1);
            $table->decimal('cost_estimate_mvr', 8, 2)->nullable();

            // Gateway response
            $table->json('gateway_response')->nullable();
            $table->text('error_message')->nullable();
            $table->string('provider', 30)->default('dhiraagu');

            // Relations
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->foreignId('campaign_id')->nullable()->constrained('sms_campaigns')->nullOnDelete();

            // Traceability — what triggered this SMS
            $table->string('reference_type', 60)->nullable(); // App\Models\Order, otp, etc.
            $table->string('reference_id', 60)->nullable();   // record id or otp code hash

            // Idempotency — prevent duplicate sends
            $table->string('idempotency_key')->nullable()->unique();

            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->index('to');
            $table->index('type');
            $table->index('status');
            $table->index('customer_id');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_logs');
    }
};
