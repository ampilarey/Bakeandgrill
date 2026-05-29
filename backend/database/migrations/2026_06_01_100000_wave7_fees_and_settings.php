<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('orders')) {
            Schema::table('orders', function (Blueprint $table): void {
                if (!Schema::hasColumn('orders', 'packaging_fee_laar')) {
                    $table->unsignedInteger('packaging_fee_laar')->default(0)->after('service_charge_applied_to');
                }
                if (!Schema::hasColumn('orders', 'small_order_fee_laar')) {
                    $table->unsignedInteger('small_order_fee_laar')->default(0)->after('packaging_fee_laar');
                }
            });
        }

        if (!Schema::hasTable('site_settings')) {
            return;
        }

        $settings = [
            [
                'key' => 'packaging_fee_enabled',
                'value' => '0',
                'type' => 'boolean',
                'group' => 'Ordering',
                'label' => 'Packaging fee enabled',
                'description' => 'Charge a packaging fee on eligible online orders',
                'is_public' => false,
            ],
            [
                'key' => 'packaging_fee_label',
                'value' => 'Packaging fee',
                'type' => 'text',
                'group' => 'Ordering',
                'label' => 'Packaging fee label',
                'description' => 'Receipt label for the packaging fee',
                'is_public' => false,
            ],
            [
                'key' => 'packaging_fee_type',
                'value' => 'fixed',
                'type' => 'text',
                'group' => 'Ordering',
                'label' => 'Packaging fee type',
                'description' => 'percent or fixed',
                'is_public' => false,
            ],
            [
                'key' => 'packaging_fee_value',
                'value' => '0',
                'type' => 'text',
                'group' => 'Ordering',
                'label' => 'Packaging fee value',
                'description' => 'Percent or fixed MVR amount',
                'is_public' => false,
            ],
            [
                'key' => 'packaging_fee_apply_delivery',
                'value' => '1',
                'type' => 'boolean',
                'group' => 'Ordering',
                'label' => 'Packaging fee on delivery',
                'description' => 'Apply packaging fee to delivery orders',
                'is_public' => false,
            ],
            [
                'key' => 'packaging_fee_apply_online_pickup',
                'value' => '1',
                'type' => 'boolean',
                'group' => 'Ordering',
                'label' => 'Packaging fee on online pickup',
                'description' => 'Apply packaging fee to online pickup orders',
                'is_public' => false,
            ],
            [
                'key' => 'small_order_fee_enabled',
                'value' => '0',
                'type' => 'boolean',
                'group' => 'Ordering',
                'label' => 'Small order fee enabled',
                'description' => 'Charge a fee when the order subtotal is below the threshold',
                'is_public' => false,
            ],
            [
                'key' => 'small_order_fee_threshold_mvr',
                'value' => '50',
                'type' => 'text',
                'group' => 'Ordering',
                'label' => 'Small order threshold (MVR)',
                'description' => 'Orders below this subtotal incur the small order fee',
                'is_public' => false,
            ],
            [
                'key' => 'small_order_fee_amount_mvr',
                'value' => '10',
                'type' => 'text',
                'group' => 'Ordering',
                'label' => 'Small order fee (MVR)',
                'description' => 'Fixed fee when subtotal is below threshold',
                'is_public' => false,
            ],
            [
                'key' => 'ordering_max_per_15min',
                'value' => '0',
                'type' => 'text',
                'group' => 'Ordering',
                'label' => 'Max online orders per 15 minutes',
                'description' => '0 = unlimited',
                'is_public' => false,
            ],
            [
                'key' => 'ramadan_hours_preset',
                'value' => null,
                'type' => 'json',
                'group' => 'Ordering',
                'label' => 'Ramadan hours preset',
                'description' => 'Optional JSON template for seasonal opening hours',
                'is_public' => false,
            ],
        ];

        foreach ($settings as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                array_merge($row, [
                    'created_at' => now(),
                    'updated_at' => now(),
                ]),
            );
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('orders')) {
            Schema::table('orders', function (Blueprint $table): void {
                if (Schema::hasColumn('orders', 'packaging_fee_laar')) {
                    $table->dropColumn('packaging_fee_laar');
                }
                if (Schema::hasColumn('orders', 'small_order_fee_laar')) {
                    $table->dropColumn('small_order_fee_laar');
                }
            });
        }

        if (Schema::hasTable('site_settings')) {
            DB::table('site_settings')->whereIn('key', [
                'packaging_fee_enabled',
                'packaging_fee_label',
                'packaging_fee_type',
                'packaging_fee_value',
                'packaging_fee_apply_delivery',
                'packaging_fee_apply_online_pickup',
                'small_order_fee_enabled',
                'small_order_fee_threshold_mvr',
                'small_order_fee_amount_mvr',
                'ordering_max_per_15min',
                'ramadan_hours_preset',
            ])->delete();
        }
    }
};
