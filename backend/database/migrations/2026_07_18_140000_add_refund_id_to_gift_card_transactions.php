<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('gift_card_transactions', function (Blueprint $table): void {
            $table->foreignId('refund_id')
                ->nullable()
                ->after('order_id')
                ->constrained('refunds')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('gift_card_transactions', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('refund_id');
        });
    }
};
