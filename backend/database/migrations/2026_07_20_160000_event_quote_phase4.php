<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        DB::table('site_settings')->updateOrInsert(
            ['key' => 'catering_reminder_enabled'],
            [
                'value' => '1',
                'type' => 'boolean',
                'group' => 'Ordering',
                'label' => 'Day-before event reminders',
                'description' => 'SMS/email reminder to customer and event staff the day before a confirmed event',
                'is_public' => false,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );

        $categoryId = DB::table('categories')->where('slug', 'custom-catering')->value('id');
        if (!$categoryId) {
            $categoryId = DB::table('categories')->insertGetId([
                'name' => 'Custom Catering',
                'slug' => 'custom-catering',
                'sort_order' => 9999,
                'is_active' => false,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $exists = DB::table('items')->where('sku', 'CATERING-CUSTOM')->exists();
        if (!$exists) {
            DB::table('items')->insert([
                'category_id' => $categoryId,
                'name' => 'Custom catering item',
                'sku' => 'CATERING-CUSTOM',
                'base_price' => 0,
                'is_active' => false,
                'is_available' => false,
                'track_stock' => false,
                'availability_type' => 'made_to_order',
                'stock_quantity' => 0,
                'has_variants' => false,
                'tax_code' => 'standard_8',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('site_settings')->where('key', 'catering_reminder_enabled')->delete();
        DB::table('items')->where('sku', 'CATERING-CUSTOM')->delete();
        DB::table('categories')->where('slug', 'custom-catering')->delete();
    }
};
