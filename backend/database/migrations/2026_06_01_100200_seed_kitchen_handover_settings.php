<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $rows = [
            ['key' => 'kitchen_require_pos_receiving_before_ready', 'value' => 'true', 'type' => 'boolean', 'group' => 'Kitchen', 'label' => 'Require POS receiving before Mark Ready', 'description' => 'Cashier must receive from kitchen before marking order ready', 'is_public' => false],
            ['key' => 'kitchen_receive_updates_prepared_stock', 'value' => 'true', 'type' => 'boolean', 'group' => 'Kitchen', 'label' => 'POS receive updates prepared stock', 'description' => 'Increase menu prepared stock when POS receives prepared-stock batches', 'is_public' => false],
            ['key' => 'kitchen_manager_verification_for_prepared_stock', 'value' => 'false', 'type' => 'boolean', 'group' => 'Kitchen', 'label' => 'Manager verification for prepared stock', 'description' => 'Hold prepared stock until manager verifies receive', 'is_public' => false],
            ['key' => 'kitchen_allow_staff_prepared_stock_batches', 'value' => 'true', 'type' => 'boolean', 'group' => 'Kitchen', 'label' => 'Kitchen staff can create prepared stock batches', 'description' => 'Allow KDS staff to log counter-stock production', 'is_public' => false],
            ['key' => 'kitchen_photo_required_for_reject_waste', 'value' => 'false', 'type' => 'boolean', 'group' => 'Kitchen', 'label' => 'Photo required for reject/waste', 'description' => 'Require photo attachment when recording waste or rejection', 'is_public' => false],
            ['key' => 'kitchen_production_consumes_recipe_stock', 'value' => 'false', 'type' => 'boolean', 'group' => 'Kitchen', 'label' => 'Production consumes recipe stock', 'description' => 'Deduct raw inventory when prepared-stock batch is submitted', 'is_public' => false],
        ];

        foreach ($rows as $row) {
            DB::table('site_settings')->updateOrInsert(['key' => $row['key']], $row);
        }
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', [
            'kitchen_require_pos_receiving_before_ready',
            'kitchen_receive_updates_prepared_stock',
            'kitchen_manager_verification_for_prepared_stock',
            'kitchen_allow_staff_prepared_stock_batches',
            'kitchen_photo_required_for_reject_waste',
            'kitchen_production_consumes_recipe_stock',
        ])->delete();
    }
};
