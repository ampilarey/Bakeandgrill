<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table): void {
            // When set, only this customer can redeem the code.
            $table->foreignId('restricted_customer_id')
                ->nullable()
                ->after('scope')
                ->constrained('customers')
                ->nullOnDelete();

            $table->index('restricted_customer_id');
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table): void {
            $table->dropForeign(['restricted_customer_id']);
            $table->dropColumn('restricted_customer_id');
        });
    }
};
