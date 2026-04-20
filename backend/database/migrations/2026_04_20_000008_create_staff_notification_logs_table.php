<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_notification_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->string('event_type');
            $table->enum('recipient_type', ['staff', 'contact', 'group_member', 'fallback']);
            $table->unsignedBigInteger('recipient_id')->nullable();
            $table->string('phone', 20);
            $table->text('message');
            $table->string('status')->default('queued');
            $table->string('idempotency_key')->unique();
            $table->boolean('fallback_used')->default(false);
            $table->foreignId('sms_log_id')->nullable()->constrained('sms_logs')->nullOnDelete();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->timestamps();

            $table->index(['order_id', 'event_type']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_notification_logs');
    }
};
