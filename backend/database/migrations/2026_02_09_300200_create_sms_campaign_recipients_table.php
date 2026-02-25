<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sms_campaign_recipients', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('campaign_id')->constrained('sms_campaigns')->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->string('phone', 20);
            $table->string('name')->nullable();

            // Per-recipient status
            $table->string('status', 20)->default('pending'); // pending | sent | failed
            $table->text('failure_reason')->nullable();
            $table->decimal('cost_mvr', 8, 4)->nullable();

            // Link to the sms_log entry once sent
            $table->foreignId('sms_log_id')->nullable()->constrained('sms_logs')->nullOnDelete();

            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->index(['campaign_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_campaign_recipients');
    }
};
