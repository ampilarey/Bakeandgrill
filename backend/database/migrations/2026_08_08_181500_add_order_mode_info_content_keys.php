<?php

declare(strict_types=1);

use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Order-app home mode cards: dine-in hint + info-sheet / status wording.
 * Public so the React order app can read them via content / site-settings.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        $rows = [
            [
                'key' => 'order_mode_dine_in_hint',
                'value' => 'Order and pay online — your table is held for you and food is ready when you arrive.',
                'type' => 'text',
                'group' => 'Order App',
                'label' => 'Eat here mode hint',
                'description' => 'Hint under the Eat here mode card.',
                'is_public' => true,
            ],
            [
                'key' => 'order_mode_delivery_info',
                'value' => 'We bring your order to your door. Choose your address at checkout and track it on the way.',
                'type' => 'textarea',
                'group' => 'Order App',
                'label' => 'Delivery — info sheet',
                'description' => 'Explanation shown when someone taps Delivery (especially when it is closed).',
                'is_public' => true,
            ],
            [
                'key' => 'order_mode_pickup_info',
                'value' => 'Order online, then collect from our shop when it is ready. No need to wait in a queue to order.',
                'type' => 'textarea',
                'group' => 'Order App',
                'label' => 'Pickup — info sheet',
                'description' => 'Explanation shown when someone taps Pickup (especially when it is closed).',
                'is_public' => true,
            ],
            [
                'key' => 'order_mode_dine_in_info',
                'value' => 'Order and pay online, and your table is held for you. Food is ready when you arrive.',
                'type' => 'textarea',
                'group' => 'Order App',
                'label' => 'Eat here — info sheet',
                'description' => 'Explanation shown when someone taps Eat here (especially when it is closed).',
                'is_public' => true,
            ],
            [
                'key' => 'order_mode_status_available',
                'value' => 'Available now',
                'type' => 'text',
                'group' => 'Order App',
                'label' => 'Mode status — available',
                'description' => 'Status line when a fulfilment mode is available right now.',
                'is_public' => true,
            ],
            [
                'key' => 'order_mode_status_unavailable',
                'value' => 'Unavailable right now',
                'type' => 'text',
                'group' => 'Order App',
                'label' => 'Mode status — unavailable',
                'description' => 'Status line when a mode is off (and no reopening time is known).',
                'is_public' => true,
            ],
            [
                'key' => 'order_mode_status_unavailable_opens',
                'value' => 'Closed until {time}',
                'type' => 'text',
                'group' => 'Order App',
                'label' => 'Mode status — closed until',
                'description' => 'Status when a mode is closed by hours. Use {time} for the next opening time.',
                'is_public' => true,
            ],
            [
                'key' => 'order_mode_learn_more',
                'value' => 'Learn more',
                'type' => 'text',
                'group' => 'Order App',
                'label' => 'Mode card — Learn more',
                'description' => 'Link text on a closed mode card (opens the info sheet).',
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
                    'type' => $row['type'],
                    'updated_at' => $now,
                ]);
            } else {
                DB::table('site_settings')->insert(array_merge($row, [
                    'created_at' => $now,
                    'updated_at' => $now,
                ]));
            }
        }

        SiteSetting::bust();
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', [
            'order_mode_dine_in_hint',
            'order_mode_delivery_info',
            'order_mode_pickup_info',
            'order_mode_dine_in_info',
            'order_mode_status_available',
            'order_mode_status_unavailable',
            'order_mode_status_unavailable_opens',
            'order_mode_learn_more',
        ])->delete();

        SiteSetting::bust();
    }
};
