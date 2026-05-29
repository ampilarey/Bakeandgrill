<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $settings = [
            [
                'key' => 'service_charge_enabled',
                'value' => '0',
                'type' => 'boolean',
                'group' => 'Charges',
                'label' => 'Enable service charge',
                'description' => 'When on, eligible orders include a service charge calculated by the backend.',
                'is_public' => true,
            ],
            [
                'key' => 'service_charge_label',
                'value' => 'Service charge',
                'type' => 'text',
                'group' => 'Charges',
                'label' => 'Service charge label',
                'description' => 'Line label on receipts and checkout (max 50 characters).',
                'is_public' => true,
            ],
            [
                'key' => 'service_charge_type',
                'value' => 'percent',
                'type' => 'text',
                'group' => 'Charges',
                'label' => 'Charge type',
                'description' => 'percent or fixed',
                'is_public' => true,
            ],
            [
                'key' => 'service_charge_value',
                'value' => '10',
                'type' => 'text',
                'group' => 'Charges',
                'label' => 'Charge value',
                'description' => 'Percentage (e.g. 10 = 10%) or fixed MVR amount.',
                'is_public' => true,
            ],
            [
                'key' => 'service_charge_apply_dine_in',
                'value' => '1',
                'type' => 'boolean',
                'group' => 'Charges',
                'label' => 'Apply to dine-in',
                'description' => 'Include service charge on dine-in orders.',
                'is_public' => true,
            ],
            [
                'key' => 'service_charge_apply_takeaway',
                'value' => '0',
                'type' => 'boolean',
                'group' => 'Charges',
                'label' => 'Apply to takeaway',
                'description' => 'Include service charge on takeaway orders.',
                'is_public' => true,
            ],
            [
                'key' => 'service_charge_apply_online_pickup',
                'value' => '0',
                'type' => 'boolean',
                'group' => 'Charges',
                'label' => 'Apply to online pickup',
                'description' => 'Include service charge on online pickup orders.',
                'is_public' => true,
            ],
            [
                'key' => 'service_charge_apply_delivery',
                'value' => '0',
                'type' => 'boolean',
                'group' => 'Charges',
                'label' => 'Apply to delivery',
                'description' => 'Include service charge on delivery orders.',
                'is_public' => true,
            ],
            [
                'key' => 'service_charge_taxable',
                'value' => '1',
                'type' => 'boolean',
                'group' => 'Charges',
                'label' => 'Taxable',
                'description' => 'When on, GST is calculated on the service charge amount.',
                'is_public' => false,
            ],
            [
                'key' => 'show_service_charge_on_receipts',
                'value' => '1',
                'type' => 'boolean',
                'group' => 'Charges',
                'label' => 'Show on receipts',
                'description' => 'Display service charge as a separate line on receipts.',
                'is_public' => false,
            ],
        ];

        foreach ($settings as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                array_merge($row, ['created_at' => now(), 'updated_at' => now()]),
            );
        }
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', [
            'service_charge_enabled',
            'service_charge_label',
            'service_charge_type',
            'service_charge_value',
            'service_charge_apply_dine_in',
            'service_charge_apply_takeaway',
            'service_charge_apply_online_pickup',
            'service_charge_apply_delivery',
            'service_charge_taxable',
            'show_service_charge_on_receipts',
        ])->delete();
    }
};
