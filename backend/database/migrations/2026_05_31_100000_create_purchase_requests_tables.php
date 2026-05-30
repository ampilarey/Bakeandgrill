<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_requests', function (Blueprint $table) {
            $table->id();
            $table->string('request_no', 32)->unique();
            $table->string('title')->nullable();
            $table->string('source', 16)->default('admin'); // pos, kds, admin
            $table->string('status', 32)->default('requested');
            $table->string('priority', 16)->default('normal'); // low, normal, urgent
            $table->dateTime('needed_by')->nullable();
            $table->foreignId('requested_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('rejected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('rejection_reason')->nullable();
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('total_estimated_laar')->nullable();
            $table->unsignedBigInteger('total_actual_laar')->nullable();
            $table->foreignId('purchase_id')->nullable()->constrained('purchases')->nullOnDelete();
            $table->foreignId('expense_id')->nullable()->constrained('expenses')->nullOnDelete();
            $table->foreignId('merged_into_id')->nullable()->constrained('purchase_requests')->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'priority', 'needed_by']);
            $table->index('assigned_to');
            $table->index('requested_by');
        });

        Schema::create('purchase_request_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_request_id')->constrained('purchase_requests')->cascadeOnDelete();
            $table->foreignId('inventory_item_id')->nullable()->constrained('inventory_items')->nullOnDelete();
            $table->foreignId('menu_item_id')->nullable()->constrained('items')->nullOnDelete();
            $table->string('free_text_name')->nullable();
            $table->string('category')->nullable();
            $table->decimal('requested_qty', 12, 3);
            $table->string('requested_unit', 32);
            $table->decimal('approved_qty', 12, 3)->nullable();
            $table->decimal('actual_qty', 12, 3)->nullable();
            $table->string('actual_unit', 32)->nullable();
            $table->unsignedBigInteger('estimated_unit_cost_laar')->nullable();
            $table->unsignedBigInteger('actual_unit_cost_laar')->nullable();
            $table->unsignedBigInteger('actual_total_laar')->nullable();
            $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
            $table->string('supplier_name_text')->nullable();
            $table->string('status', 32)->default('pending');
            $table->string('reason', 32)->nullable();
            $table->text('notes')->nullable();
            $table->text('buyer_notes')->nullable();
            $table->text('verified_notes')->nullable();
            $table->dateTime('bought_at')->nullable();
            $table->dateTime('received_at')->nullable();
            $table->timestamps();

            $table->index(['purchase_request_id', 'status']);
        });

        Schema::create('purchase_request_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_request_id')->constrained('purchase_requests')->cascadeOnDelete();
            $table->foreignId('purchase_request_item_id')->nullable()->constrained('purchase_request_items')->nullOnDelete();
            $table->foreignId('uploaded_by')->constrained('users')->cascadeOnDelete();
            $table->string('type', 32); // request_photo, receipt, delivery_note, other
            $table->string('file_path');
            $table->string('original_filename')->nullable();
            $table->string('mime_type', 128)->nullable();
            $table->unsignedBigInteger('size')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_request_attachments');
        Schema::dropIfExists('purchase_request_items');
        Schema::dropIfExists('purchase_requests');
    }
};
