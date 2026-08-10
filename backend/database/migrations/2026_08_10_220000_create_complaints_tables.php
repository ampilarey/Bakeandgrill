<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('complaints', function (Blueprint $table) {
            $table->id();
            $table->string('reference_number', 32)->unique();
            $table->foreignId('receipt_id')->nullable()->constrained('receipts')->nullOnDelete();
            $table->foreignId('invoice_id')->nullable()->constrained('invoices')->nullOnDelete();
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->foreignId('receipt_feedback_id')->nullable()->constrained('receipt_feedback')->nullOnDelete();
            $table->string('source', 32)->default('receipt'); // receipt|invoice|receipt_feedback
            $table->string('category', 64);
            $table->text('comment')->nullable();
            $table->string('photo_disk', 32)->nullable();
            $table->string('photo_path')->nullable();
            $table->string('status', 32)->default('new');
            $table->boolean('needs_refund_review')->default(false);
            $table->boolean('is_food_safety')->default(false);
            $table->foreignId('shift_id')->nullable()->constrained('shifts')->nullOnDelete();
            $table->foreignId('cashier_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('owner_alert_status', 32)->default('pending'); // pending|sent|suppressed|failed|retried
            $table->text('owner_alert_detail')->nullable();
            $table->text('resolution_note')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('idempotency_key', 128)->nullable()->unique();
            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->index(['is_food_safety', 'status']);
            $table->index('category');
        });

        Schema::create('complaint_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('complaint_id')->constrained('complaints')->cascadeOnDelete();
            $table->unsignedBigInteger('order_item_id')->nullable();
            $table->string('item_name');
            $table->decimal('quantity', 12, 3)->default(1);
            $table->unsignedBigInteger('unit_price_laar')->default(0);
            $table->unsignedBigInteger('line_total_laar')->default(0);
            $table->timestamps();

            $table->index('complaint_id');
        });

        Schema::create('complaint_status_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('complaint_id')->constrained('complaints')->cascadeOnDelete();
            $table->string('from_status', 32)->nullable();
            $table->string('to_status', 32);
            $table->foreignId('changed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('internal_note')->nullable();
            $table->text('resolution_note')->nullable();
            $table->timestamps();

            $table->index('complaint_id');
        });

        Schema::create('complaint_contact_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('complaint_id')->constrained('complaints')->cascadeOnDelete();
            $table->string('channel', 32); // phone|whatsapp|in_person
            $table->text('note');
            $table->foreignId('logged_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('complaint_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('complaint_contact_logs');
        Schema::dropIfExists('complaint_status_histories');
        Schema::dropIfExists('complaint_items');
        Schema::dropIfExists('complaints');
    }
};
