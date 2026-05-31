<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kitchen_production_batches', function (Blueprint $table) {
            $table->id();
            $table->string('batch_no', 32)->unique();
            $table->string('production_type', 32)->default('order_bound');
            $table->string('source', 16)->default('kds');
            $table->string('status', 32)->default('draft');
            $table->string('station')->nullable();
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->foreignId('produced_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('submitted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('submitted_at')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('cancelled_at')->nullable();
            $table->text('cancellation_reason')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['status', 'production_type'], 'kp_batches_status_type_idx');
            $table->index('order_id', 'kp_batches_order_idx');
            $table->index('produced_by', 'kp_batches_producer_idx');
        });

        Schema::create('kitchen_production_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kitchen_production_batch_id')->constrained('kitchen_production_batches')->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->foreignId('order_item_id')->nullable()->constrained('order_items')->nullOnDelete();
            $table->foreignId('item_id')->nullable()->constrained('items')->nullOnDelete();
            $table->foreignId('variant_id')->nullable()->constrained('variants')->nullOnDelete();
            $table->foreignId('inventory_item_id')->nullable()->constrained('inventory_items')->nullOnDelete();
            $table->foreignId('recipe_id')->nullable()->constrained('recipes')->nullOnDelete();
            $table->string('free_text_name')->nullable();
            $table->decimal('produced_qty', 12, 3)->default(0);
            $table->string('unit', 32)->default('pcs');
            $table->decimal('waste_qty', 12, 3)->default(0);
            $table->decimal('extra_qty', 12, 3)->default(0);
            $table->decimal('expected_receive_qty', 12, 3)->default(0);
            $table->string('batch_code')->nullable();
            $table->dateTime('expires_at')->nullable();
            $table->string('status', 32)->default('pending');
            $table->text('kitchen_notes')->nullable();
            $table->timestamps();

            $table->index(['kitchen_production_batch_id', 'status'], 'kp_items_batch_status_idx');
            $table->index('order_item_id', 'kp_items_order_item_idx');
        });

        Schema::create('kitchen_receiving_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kitchen_production_batch_id')->constrained('kitchen_production_batches')->cascadeOnDelete();
            $table->foreignId('received_by')->constrained('users')->cascadeOnDelete();
            $table->dateTime('received_at');
            $table->string('status', 32)->default('received');
            $table->string('receive_location', 32)->default('pos_counter');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('kitchen_production_batch_id', 'kp_recv_batches_prod_idx');
        });

        Schema::create('kitchen_receiving_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kitchen_receiving_batch_id')->constrained('kitchen_receiving_batches')->cascadeOnDelete();
            $table->foreignId('kitchen_production_item_id')->constrained('kitchen_production_items')->cascadeOnDelete();
            $table->decimal('received_qty', 12, 3)->default(0);
            $table->decimal('rejected_qty', 12, 3)->default(0);
            $table->decimal('missing_qty', 12, 3)->default(0);
            $table->string('condition', 32)->default('good');
            $table->string('action', 32)->default('accept');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('kitchen_production_item_id', 'kp_recv_items_prod_idx');
        });

        Schema::create('kitchen_production_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kitchen_production_batch_id')->constrained('kitchen_production_batches')->cascadeOnDelete();
            $table->foreignId('kitchen_production_item_id')->nullable()->constrained('kitchen_production_items')->nullOnDelete();
            $table->foreignId('kitchen_receiving_item_id')->nullable()->constrained('kitchen_receiving_items')->nullOnDelete();
            $table->foreignId('uploaded_by')->constrained('users')->cascadeOnDelete();
            $table->string('type', 32);
            $table->string('file_path');
            $table->string('original_filename')->nullable();
            $table->string('mime_type', 128)->nullable();
            $table->unsignedBigInteger('size')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('kitchen_production_variances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kitchen_production_batch_id')->constrained('kitchen_production_batches')->cascadeOnDelete();
            $table->foreignId('kitchen_production_item_id')->nullable()->constrained('kitchen_production_items')->nullOnDelete();
            $table->string('variance_type', 32);
            $table->decimal('qty', 12, 3);
            $table->string('unit', 32)->default('pcs');
            $table->string('reason')->nullable();
            $table->foreignId('recorded_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('reviewed_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['kitchen_production_batch_id', 'variance_type'], 'kp_var_batch_type_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kitchen_production_variances');
        Schema::dropIfExists('kitchen_production_attachments');
        Schema::dropIfExists('kitchen_receiving_items');
        Schema::dropIfExists('kitchen_receiving_batches');
        Schema::dropIfExists('kitchen_production_items');
        Schema::dropIfExists('kitchen_production_batches');
    }
};
