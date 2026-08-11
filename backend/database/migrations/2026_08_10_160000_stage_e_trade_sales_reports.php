<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stage E — shop sales-report submissions (claims only; staff still reconcile).
 *
 * Idempotent for environments that already applied objects without a migrations row.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('trade_deliveries')
            && ! Schema::hasColumn('trade_deliveries', 'reported_by_customer_id')) {
            Schema::table('trade_deliveries', function (Blueprint $table) {
                $table->foreignId('reported_by_customer_id')
                    ->nullable()
                    ->after('reported_by')
                    ->constrained('customers')
                    ->nullOnDelete();
            });
        }

        if (! Schema::hasTable('trade_sales_report_submissions')) {
            Schema::create('trade_sales_report_submissions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('trade_delivery_id')->constrained('trade_deliveries')->cascadeOnDelete();
                $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
                $table->string('idempotency_key')->unique();
                $table->json('lines_json');
                $table->timestamps();

                $table->index(['trade_delivery_id', 'created_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('trade_sales_report_submissions');
        if (Schema::hasTable('trade_deliveries')
            && Schema::hasColumn('trade_deliveries', 'reported_by_customer_id')) {
            Schema::table('trade_deliveries', function (Blueprint $table) {
                $table->dropConstrainedForeignId('reported_by_customer_id');
            });
        }
    }
};
