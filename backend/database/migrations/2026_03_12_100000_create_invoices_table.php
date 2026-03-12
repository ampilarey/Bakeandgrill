<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_number')->unique();
            $table->enum('type', ['sale', 'purchase', 'credit_note'])->default('sale');
            $table->enum('status', ['draft', 'sent', 'paid', 'overdue', 'cancelled', 'void'])->default('draft');
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('purchase_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('recipient_name')->nullable();
            $table->string('recipient_phone')->nullable();
            $table->string('recipient_email')->nullable();
            $table->text('recipient_address')->nullable();
            $table->integer('subtotal_laar')->default(0);
            $table->integer('tax_laar')->default(0);
            $table->integer('discount_laar')->default(0);
            $table->integer('total_laar')->default(0);
            $table->decimal('subtotal', 10, 2)->default(0);
            $table->decimal('tax_amount', 10, 2)->default(0);
            $table->decimal('discount_amount', 10, 2)->default(0);
            $table->decimal('total', 10, 2)->default(0);
            $table->unsignedSmallInteger('tax_rate_bp')->default(0);
            $table->date('issue_date');
            $table->date('due_date')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->string('payment_method')->nullable();
            $table->string('payment_reference')->nullable();
            $table->text('notes')->nullable();
            $table->text('terms')->nullable();
            $table->string('pdf_path')->nullable();
            $table->foreignId('parent_invoice_id')->nullable()->constrained('invoices')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['type', 'status']);
            $table->index('issue_date');
            $table->index('due_date');
        });

        Schema::create('invoice_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('inventory_item_id')->nullable()->constrained()->nullOnDelete();
            $table->string('description');
            $table->decimal('quantity', 10, 3);
            $table->string('unit')->nullable();
            $table->integer('unit_price_laar')->default(0);
            $table->integer('total_laar')->default(0);
            $table->decimal('unit_price', 10, 2)->default(0);
            $table->decimal('total', 10, 2)->default(0);
            $table->unsignedSmallInteger('tax_rate_bp')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoice_items');
        Schema::dropIfExists('invoices');
    }
};
