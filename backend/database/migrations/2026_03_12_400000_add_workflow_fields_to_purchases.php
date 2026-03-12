<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchases', function (Blueprint $table) {
            $table->foreignId('approved_by')->nullable()->after('user_id')->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable()->after('approved_by');
            $table->date('expected_delivery_date')->nullable()->after('purchase_date');
            $table->date('actual_delivery_date')->nullable()->after('expected_delivery_date');
        });

        Schema::table('purchase_items', function (Blueprint $table) {
            $table->decimal('received_quantity', 10, 3)->default(0)->after('quantity');
            $table->enum('receive_status', ['pending', 'partial', 'complete', 'rejected'])->default('pending')->after('received_quantity');
        });
    }

    public function down(): void
    {
        Schema::table('purchase_items', function (Blueprint $table) {
            $table->dropColumn(['received_quantity', 'receive_status']);
        });
        Schema::table('purchases', function (Blueprint $table) {
            $table->dropColumn(['approved_by', 'approved_at', 'expected_delivery_date', 'actual_delivery_date']);
        });
    }
};
