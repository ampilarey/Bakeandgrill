<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** @var list<string> */
    private const KEYS = [
        'packaging_fee_enabled',
        'packaging_fee_type',
        'packaging_fee_value',
        'packaging_fee_apply_delivery',
        'packaging_fee_apply_online_pickup',
    ];

    public function up(): void
    {
        DB::table('site_settings')->whereIn('key', self::KEYS)->delete();
    }

    public function down(): void
    {
        $now = now();
        foreach ([
            ['packaging_fee_enabled', '0', 'boolean', 'Packaging fee enabled'],
            ['packaging_fee_type', 'fixed', 'text', 'Packaging fee type'],
            ['packaging_fee_value', '0', 'text', 'Packaging fee value'],
            ['packaging_fee_apply_delivery', '1', 'boolean', 'Packaging on delivery'],
            ['packaging_fee_apply_online_pickup', '1', 'boolean', 'Packaging on online pickup'],
        ] as [$key, $value, $type, $label]) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $key],
                [
                    'value' => $value,
                    'type' => $type,
                    'group' => 'Ordering',
                    'label' => $label,
                    'is_public' => false,
                    'updated_at' => $now,
                    'created_at' => $now,
                ],
            );
        }
    }
};
