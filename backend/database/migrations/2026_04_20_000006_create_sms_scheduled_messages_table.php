<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sms_scheduled_messages', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->enum('to_type', ['contact', 'group', 'phone'])->default('phone');
            $table->foreignId('to_contact_id')->nullable()->constrained('sms_contacts')->nullOnDelete();
            $table->foreignId('to_group_id')->nullable()->constrained('sms_contact_groups')->nullOnDelete();
            $table->string('to_phone', 20)->nullable();
            $table->foreignId('template_id')->nullable()->constrained('sms_templates')->nullOnDelete();
            $table->text('body')->nullable();
            $table->json('variables')->nullable();
            $table->boolean('is_recurring')->default(false);
            $table->enum('recurrence_type', ['daily', 'weekly', 'monthly'])->nullable();
            $table->json('recurrence_days')->nullable();
            $table->time('recurrence_time')->nullable();
            $table->tinyInteger('recurrence_day_of_month')->nullable();
            $table->dateTime('send_at')->nullable();
            $table->dateTime('next_send_at')->nullable();
            $table->dateTime('last_sent_at')->nullable();
            $table->enum('status', ['active', 'paused', 'completed', 'cancelled'])->default('active');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'next_send_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_scheduled_messages');
    }
};
