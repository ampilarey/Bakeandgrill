<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('low_stock_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained()->cascadeOnDelete();
            $table->integer('stock_level');
            $table->integer('threshold');
            $table->enum('alert_type', ['sms', 'email', 'system'])->default('system');
            $table->json('recipients')->nullable(); // User IDs or phone numbers
            $table->boolean('sent')->default(false);
            $table->timestamp('sent_at')->nullable();
            $table->text('message')->nullable();
            $table->timestamps();
            
            $table->index(['item_id', 'sent']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('low_stock_alerts');
    }
};
