<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('category_id')->nullable()->constrained('categories')->nullOnDelete();
            $table->string('name');
            $table->string('name_dv')->nullable(); // Dhivehi name
            $table->text('description')->nullable();
            $table->string('sku')->nullable()->unique();
            $table->string('barcode')->nullable()->unique();
            $table->string('image_url')->nullable();
            $table->decimal('base_price', 10, 2)->default(0);
            $table->decimal('cost', 10, 2)->default(0); // Cost for margin calculation
            $table->decimal('tax_rate', 5, 2)->default(0); // Tax percentage
            $table->boolean('is_active')->default(true);
            $table->boolean('is_available')->default(true); // Can be marked unavailable temporarily
            $table->integer('sort_order')->default(0);
            $table->timestamps();
            $table->softDeletes();
            
            $table->index('category_id');
            $table->index('sku');
            $table->index('barcode');
            $table->index('is_active');
            $table->index('is_available');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('items');
    }
};
