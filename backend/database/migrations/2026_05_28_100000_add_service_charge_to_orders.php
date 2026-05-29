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
            $table->boolean('service_charge_enabled')->default(false)->after('delivery_fee_laar');
            $table->string('service_charge_type', 20)->nullable()->after('service_charge_enabled');
            $table->unsignedInteger('service_charge_rate_bp')->default(0)->after('service_charge_type');
            $table->decimal('service_charge_value', 10, 2)->nullable()->after('service_charge_rate_bp');
            $table->unsignedBigInteger('service_charge_amount_laar')->default(0)->after('service_charge_value');
            $table->decimal('service_charge_amount', 10, 2)->default(0)->after('service_charge_amount_laar');
            $table->string('service_charge_label', 50)->nullable()->after('service_charge_amount');
            $table->boolean('service_charge_taxable')->default(true)->after('service_charge_label');
            $table->string('service_charge_applied_to', 32)->nullable()->after('service_charge_taxable');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn([
                'service_charge_enabled',
                'service_charge_type',
                'service_charge_rate_bp',
                'service_charge_value',
                'service_charge_amount_laar',
                'service_charge_amount',
                'service_charge_label',
                'service_charge_taxable',
                'service_charge_applied_to',
            ]);
        });
    }
};
