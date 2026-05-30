<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dateTime('pos_received_at')->nullable()->after('kitchen_done_by');
            $table->foreignId('pos_received_by')->nullable()->after('pos_received_at')->constrained('users')->nullOnDelete();
            $table->string('kitchen_handover_status', 32)->nullable()->after('pos_received_by');
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->decimal('kitchen_produced_qty', 12, 3)->nullable()->after('status');
            $table->decimal('kitchen_received_qty', 12, 3)->nullable()->after('kitchen_produced_qty');
        });
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropColumn(['kitchen_produced_qty', 'kitchen_received_qty']);
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('pos_received_by');
            $table->dropColumn(['pos_received_at', 'kitchen_handover_status']);
        });
    }
};
