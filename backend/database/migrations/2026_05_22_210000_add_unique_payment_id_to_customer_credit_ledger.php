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
            $table->unique('payment_id');
        });
    }

    public function down(): void
    {
        Schema::table('customer_credit_ledger', function (Blueprint $table): void {
            $table->dropUnique(['payment_id']);
        });
    }
};
