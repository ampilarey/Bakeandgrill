<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 3A — multi-quote capture per purchase request line.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('purchase_request_item_quotes')) {
            return;
        }

        Schema::create('purchase_request_item_quotes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_request_item_id')->constrained('purchase_request_items')->cascadeOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
            $table->string('supplier_name_text')->nullable();
            $table->unsignedBigInteger('unit_price_laar');
            $table->string('unit', 32)->default('pcs');
            $table->string('note')->nullable();
            $table->foreignId('quoted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('selected_at')->nullable();
            $table->unsignedBigInteger('savings_laar')->nullable();
            $table->timestamps();

            $table->index(['purchase_request_item_id', 'unit_price_laar']);
            $table->index(['selected_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_request_item_quotes');
    }
};
