<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Phase 3C — wastage-aware reorder settings (defaults preserve current behaviour).
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        $rows = [
            [
                'key' => 'restock_include_waste',
                'value' => '0',
                'type' => 'boolean',
                'group' => 'Inventory',
                'label' => 'Include waste in restock suggestions',
                'description' => 'When on, Restock Plan / auto restock PR use usage + waste as the effective daily rate. Off by default.',
                'is_public' => false,
            ],
            [
                'key' => 'restock_high_waste_pct',
                'value' => '15',
                'type' => 'text',
                'group' => 'Inventory',
                'label' => 'High-waste threshold (%)',
                'description' => 'Flag restock rows when waste_pct is at or above this value (default 15).',
                'is_public' => false,
            ],
        ];

        foreach ($rows as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                array_merge($row, [
                    'created_at' => $now,
                    'updated_at' => $now,
                ]),
            );
        }
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', [
            'restock_include_waste',
            'restock_high_waste_pct',
        ])->delete();
    }
};
