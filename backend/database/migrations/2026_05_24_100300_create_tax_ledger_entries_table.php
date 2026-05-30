<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tax_ledger_entries', function (Blueprint $table) {
            $table->id();
            $table->string('period_key', 10)->index();
            $table->string('source_type', 30);
            $table->unsignedBigInteger('source_id');
            $table->string('direction', 20);
            $table->string('tax_code', 20);
            $table->string('taxable_activity_no', 30)->nullable();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->string('customer_tin', 30)->nullable();
            $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $table->string('supplier_tin', 30)->nullable();
            $table->string('document_no', 64);
            $table->date('document_date');
            $table->bigInteger('taxable_value_laar')->default(0);
            $table->bigInteger('tax_laar')->default(0);
            $table->bigInteger('total_laar')->default(0);
            $table->unsignedSmallInteger('rate_bp')->default(0);
            $table->string('channel', 30)->nullable();
            $table->date('payment_basis_date')->nullable();
            $table->date('invoice_basis_date')->nullable();
            $table->boolean('is_tax_invoice')->default(false);
            $table->boolean('is_claimable')->default(false);
            $table->string('claim_block_reason')->nullable();
            $table->string('revenue_or_capital', 20)->nullable();
            $table->json('metadata')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(
                ['source_type', 'source_id', 'direction', 'tax_code', 'document_no'],
                'tax_ledger_idempotency'
            );
            $table->index(['period_key', 'direction', 'tax_code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tax_ledger_entries');
    }
};
