<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        $templates = [
            [
                'slug' => 'trade_dispatch_shop',
                'name' => 'Wholesale dispatch (shop)',
                'type' => 'order_notification',
                'body' => 'Bake & Grill: we delivered {{item_summary}} to {{shop_name}} ({{delivery_number}}). Please tell us what sells. Reply or call us.',
                'description' => 'Sent to the shop contact when a consignment is dispatched. Must not mention money owed.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'shop_name', 'description' => 'Trade shop name'],
                    ['name' => 'delivery_number', 'description' => 'Delivery note number'],
                    ['name' => 'item_summary', 'description' => 'Short list of items and quantities'],
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'slug' => 'trade_reconcile_mismatch_owner',
                'name' => 'Wholesale reconcile mismatch (owner)',
                'type' => 'order_notification',
                'body' => 'Wholesale mismatch at {{shop_name}} on {{delivery_number}}: {{item_name}} - shop said sold {{reported_sold}}, count implies sold {{implied_sold}}. Check before invoicing.',
                'description' => 'Sent to the owner when reported sold disagrees with counted returns.',
                'is_system' => true,
                'variables' => json_encode([
                    ['name' => 'shop_name', 'description' => 'Trade shop name'],
                    ['name' => 'delivery_number', 'description' => 'Delivery note number'],
                    ['name' => 'item_name', 'description' => 'Menu item name'],
                    ['name' => 'reported_sold', 'description' => 'What the shop claimed sold'],
                    ['name' => 'implied_sold', 'description' => 'qty_sent minus counted return'],
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ];

        foreach ($templates as $row) {
            $exists = DB::table('sms_templates')->where('slug', $row['slug'])->exists();
            if (! $exists) {
                DB::table('sms_templates')->insert($row);
            }
        }
    }

    public function down(): void
    {
        DB::table('sms_templates')->whereIn('slug', [
            'trade_dispatch_shop',
            'trade_reconcile_mismatch_owner',
        ])->delete();
    }
};
