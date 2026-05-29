<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $rows = [
            [
                'key' => 'delivery_default_fee',
                'value' => null,
                'type' => 'text',
                'group' => 'Delivery',
                'label' => 'Default delivery fee (MVR)',
                'description' => 'Fee for islands not listed in zone fees. Falls back to config when empty.',
                'is_public' => false,
            ],
            [
                'key' => 'delivery_free_threshold',
                'value' => null,
                'type' => 'text',
                'group' => 'Delivery',
                'label' => 'Free delivery threshold (MVR)',
                'description' => 'Subtotal at or above this amount gets free delivery. Set 0 to disable.',
                'is_public' => true,
            ],
            [
                'key' => 'delivery_zone_fees',
                'value' => null,
                'type' => 'json',
                'group' => 'Delivery',
                'label' => 'Delivery zone fees',
                'description' => 'JSON map of island/area name to fee in MVR, e.g. {"Male":20,"Hulhumale":30}.',
                'is_public' => false,
            ],
        ];

        foreach ($rows as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                array_merge($row, ['created_at' => now(), 'updated_at' => now()]),
            );
        }
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', [
            'delivery_default_fee',
            'delivery_free_threshold',
            'delivery_zone_fees',
        ])->delete();
    }
};
