<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('tin', 30)->nullable()->after('email');
            $table->boolean('is_gst_registered')->default(false)->after('tin');
            $table->text('billing_address')->nullable()->after('is_gst_registered');
        });

        Schema::table('suppliers', function (Blueprint $table) {
            $table->string('tin', 30)->nullable()->after('email');
        });

        Schema::table('invoices', function (Blueprint $table) {
            $table->boolean('is_tax_invoice')->default(false)->after('type');
            $table->string('customer_tin', 30)->nullable()->after('recipient_address');
            $table->string('credit_note_reason')->nullable()->after('parent_invoice_id');
        });

        Schema::table('purchases', function (Blueprint $table) {
            $table->string('supplier_tin', 30)->nullable()->after('supplier_id');
            $table->string('supplier_invoice_no', 64)->nullable()->after('supplier_tin');
            $table->date('supplier_invoice_date')->nullable()->after('supplier_invoice_no');
            $table->bigInteger('amount_excluding_gst_laar')->nullable()->after('subtotal');
            $table->unsignedSmallInteger('gst_rate_bp')->default(0)->after('amount_excluding_gst_laar');
            $table->bigInteger('gst_laar')->default(0)->after('gst_rate_bp');
            $table->bigInteger('total_laar')->nullable()->after('gst_laar');
            $table->boolean('is_tax_invoice_received')->default(false)->after('total_laar');
            $table->boolean('is_input_tax_claimable')->default(false)->after('is_tax_invoice_received');
            $table->string('claim_block_reason')->nullable()->after('is_input_tax_claimable');
            $table->string('revenue_or_capital', 20)->nullable()->after('claim_block_reason');
            $table->string('taxable_activity_no', 30)->nullable()->after('revenue_or_capital');
            $table->string('receipt_path')->nullable()->after('taxable_activity_no');
        });

        Schema::table('expenses', function (Blueprint $table) {
            $table->string('supplier_tin', 30)->nullable()->after('supplier_id');
            $table->string('supplier_invoice_no', 64)->nullable()->after('supplier_tin');
            $table->date('supplier_invoice_date')->nullable()->after('supplier_invoice_no');
            $table->bigInteger('amount_excluding_gst_laar')->nullable()->after('amount_laar');
            $table->unsignedSmallInteger('gst_rate_bp')->default(0)->after('amount_excluding_gst_laar');
            $table->boolean('is_tax_invoice_received')->default(false)->after('gst_rate_bp');
            $table->boolean('is_input_tax_claimable')->default(false)->after('is_tax_invoice_received');
            $table->string('claim_block_reason')->nullable()->after('is_input_tax_claimable');
            $table->string('revenue_or_capital', 20)->nullable()->after('claim_block_reason');
            $table->string('taxable_activity_no', 30)->nullable()->after('revenue_or_capital');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn(['tin', 'is_gst_registered', 'billing_address']);
        });

        Schema::table('suppliers', function (Blueprint $table) {
            $table->dropColumn('tin');
        });

        Schema::table('invoices', function (Blueprint $table) {
            $table->dropColumn(['is_tax_invoice', 'customer_tin', 'credit_note_reason']);
        });

        Schema::table('purchases', function (Blueprint $table) {
            $table->dropColumn([
                'supplier_tin', 'supplier_invoice_no', 'supplier_invoice_date',
                'amount_excluding_gst_laar', 'gst_rate_bp', 'gst_laar', 'total_laar',
                'is_tax_invoice_received', 'is_input_tax_claimable', 'claim_block_reason',
                'revenue_or_capital', 'taxable_activity_no', 'receipt_path',
            ]);
        });

        Schema::table('expenses', function (Blueprint $table) {
            $table->dropColumn([
                'supplier_tin', 'supplier_invoice_no', 'supplier_invoice_date',
                'amount_excluding_gst_laar', 'gst_rate_bp', 'is_tax_invoice_received',
                'is_input_tax_claimable', 'claim_block_reason', 'revenue_or_capital',
                'taxable_activity_no',
            ]);
        });
    }
};
