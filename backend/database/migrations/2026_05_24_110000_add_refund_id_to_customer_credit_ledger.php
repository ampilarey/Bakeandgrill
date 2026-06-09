<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customer_credit_ledger', function (Blueprint $table): void {
            $table->foreignId('refund_id')->nullable()->after('payment_id')
                ->constrained('refunds')->nullOnDelete();
            $table->index(['refund_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::table('customer_credit_ledger', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('refund_id');
        });
    }
};
