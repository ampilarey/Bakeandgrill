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
        Schema::table('customers', function (Blueprint $table) {
            $table->index('is_active');
            $table->index('sms_opt_out');
            $table->index('last_order_at');
            $table->index(['is_active', 'sms_opt_out']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropIndex(['is_active']);
            $table->dropIndex(['sms_opt_out']);
            $table->dropIndex(['last_order_at']);
            $table->dropIndex(['is_active', 'sms_opt_out']);
        });
    }
};
