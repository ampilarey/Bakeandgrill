<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds columns required by the BML payment gateway and the new Payment domain.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table): void {
            $table->string('gateway')->nullable()->after('method');
            $table->string('currency', 10)->default('MVR')->after('gateway');
            $table->bigInteger('amount_laar')->nullable()->after('currency');
            $table->string('local_id')->nullable()->after('amount_laar');
            $table->string('provider_transaction_id')->nullable()->after('local_id');
            $table->string('idempotency_key')->nullable()->after('id');
            $table->unique('idempotency_key');
            $table->unique('local_id');
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table): void {
            $table->dropUnique(['idempotency_key']);
            $table->dropUnique(['local_id']);
            $table->dropColumn([
                'idempotency_key',
                'gateway',
                'currency',
                'amount_laar',
                'local_id',
                'provider_transaction_id',
            ]);
        });
    }
};
