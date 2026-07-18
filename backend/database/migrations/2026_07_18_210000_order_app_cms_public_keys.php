<?php

declare(strict_types=1);

use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Ensure order-app home copy keys exist and are public so the React app
 * can mirror Website Settings (specials titles, visit/delivery labels).
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        $rows = [
            [
                'key' => 'home_specials_eyebrow',
                'value' => 'Limited time',
                'type' => 'text',
                'group' => 'Homepage',
                'label' => 'Specials eyebrow',
                'description' => 'Small label above the specials section (website + order app).',
                'is_public' => true,
            ],
            [
                'key' => 'home_specials_title',
                'value' => "Today's Specials",
                'type' => 'text',
                'group' => 'Homepage',
                'label' => 'Specials title',
                'description' => "Heading for today's specials (website + order app).",
                'is_public' => true,
            ],
            [
                'key' => 'order_home_reviews_title',
                'value' => 'What guests say',
                'type' => 'text',
                'group' => 'Order App',
                'label' => 'Order home reviews title',
                'description' => 'Heading above featured reviews on the order app home.',
                'is_public' => true,
            ],
            [
                'key' => 'order_mode_delivery_hint',
                'value' => '',
                'type' => 'text',
                'group' => 'Order App',
                'label' => 'Delivery mode hint',
                'description' => 'Hint under Delivery on order home. Leave blank to use delivery time + threshold.',
                'is_public' => true,
            ],
            [
                'key' => 'order_mode_pickup_hint',
                'value' => '',
                'type' => 'text',
                'group' => 'Order App',
                'label' => 'Pickup mode hint',
                'description' => 'Hint under Pickup on order home. Leave blank to use business address.',
                'is_public' => true,
            ],
        ];

        foreach ($rows as $row) {
            $existing = DB::table('site_settings')->where('key', $row['key'])->first();
            if ($existing) {
                DB::table('site_settings')->where('key', $row['key'])->update([
                    'is_public' => true,
                    'group' => $row['group'],
                    'label' => $row['label'],
                    'description' => $row['description'],
                    'updated_at' => $now,
                ]);
            } else {
                DB::table('site_settings')->insert(array_merge($row, [
                    'created_at' => $now,
                    'updated_at' => $now,
                ]));
            }
        }

        DB::table('site_settings')
            ->whereIn('key', [
                'home_specials_eyebrow',
                'home_specials_title',
                'home_visit_card_title',
                'home_delivery_card_title',
                'home_chat_label',
                'primary_color',
            ])
            ->update(['is_public' => true, 'updated_at' => $now]);

        SiteSetting::bust();
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', [
            'order_home_reviews_title',
            'order_mode_delivery_hint',
            'order_mode_pickup_hint',
        ])->delete();

        SiteSetting::bust();
    }
};
