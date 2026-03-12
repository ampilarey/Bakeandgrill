<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('expense_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('icon')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('expenses', function (Blueprint $table) {
            $table->id();
            $table->string('expense_number')->unique();
            $table->foreignId('expense_category_id')->constrained()->restrictOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->constrained();
            $table->foreignId('purchase_id')->nullable()->constrained()->nullOnDelete();
            $table->string('description');
            $table->integer('amount_laar');
            $table->decimal('amount', 10, 2);
            $table->integer('tax_laar')->default(0);
            $table->decimal('tax_amount', 10, 2)->default(0);
            $table->string('payment_method')->nullable();
            $table->string('reference_number')->nullable();
            $table->date('expense_date');
            $table->string('receipt_path')->nullable();
            $table->boolean('is_recurring')->default(false);
            $table->string('recurrence_interval')->nullable();
            $table->date('next_recurrence_date')->nullable();
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('approved');
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('expense_date');
            $table->index(['expense_category_id', 'expense_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expenses');
        Schema::dropIfExists('expense_categories');
    }
};
