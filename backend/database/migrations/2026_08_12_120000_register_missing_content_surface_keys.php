<?php

declare(strict_types=1);

use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Ensure orphan customer-facing keys used by Website / Order App renderers
 * exist in site_settings with public visibility. Registry membership is in
 * config/content.php — this migration only seeds rows for existing installs.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        $rows = [
            [
                'key' => 'home_chat_label',
                'value' => 'Chat with us',
                'type' => 'text',
                'group' => 'Homepage',
                'label' => 'Home — Chat label',
                'description' => 'Label for the chat action on Website home / Order App brand footer.',
                'is_public' => true,
            ],
            [
                'key' => 'home_visit_card_title',
                'value' => 'Visit us',
                'type' => 'text',
                'group' => 'Homepage',
                'label' => 'Home — Visit card title',
                'description' => null,
                'is_public' => true,
            ],
            [
                'key' => 'home_delivery_card_title',
                'value' => 'Delivery',
                'type' => 'text',
                'group' => 'Homepage',
                'label' => 'Home — Delivery card title',
                'description' => null,
                'is_public' => true,
            ],
            [
                'key' => 'home_directions_cta',
                'value' => 'Get directions',
                'type' => 'text',
                'group' => 'Homepage',
                'label' => 'Home — Directions CTA',
                'description' => null,
                'is_public' => true,
            ],
            [
                'key' => 'home_call_cta',
                'value' => 'Call us',
                'type' => 'text',
                'group' => 'Homepage',
                'label' => 'Home — Call CTA',
                'description' => null,
                'is_public' => true,
            ],
            [
                'key' => 'home_order_via_app_label',
                'value' => 'Order via app',
                'type' => 'text',
                'group' => 'Homepage',
                'label' => 'Home — Order via app label',
                'description' => null,
                'is_public' => true,
            ],
            [
                'key' => 'legal_last_updated_date',
                'value' => '',
                'type' => 'text',
                'group' => 'Legal',
                'label' => 'Legal — Last updated date',
                'description' => 'Shown on legal pages (privacy / terms / refunds).',
                'is_public' => true,
            ],
            [
                'key' => 'meta_keywords',
                'value' => '',
                'type' => 'text',
                'group' => 'SEO',
                'label' => 'SEO — Meta keywords',
                'description' => null,
                'is_public' => false,
            ],
            [
                'key' => 'google_analytics_id',
                'value' => '',
                'type' => 'text',
                'group' => 'SEO',
                'label' => 'Google Analytics ID',
                'description' => 'Measurement ID (G-…) for Website and Order App analytics.',
                'is_public' => true,
            ],
            [
                'key' => 'google_tag_manager_id',
                'value' => '',
                'type' => 'text',
                'group' => 'SEO',
                'label' => 'Google Tag Manager ID',
                'description' => 'Container ID (GTM-…) for Website and Order App.',
                'is_public' => true,
            ],
        ];

        foreach ($rows as $row) {
            $existing = DB::table('site_settings')->where('key', $row['key'])->first();
            if ($existing) {
                DB::table('site_settings')->where('key', $row['key'])->update([
                    'is_public' => $row['is_public'],
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
        // Keep rows — removing would break live Blade/Order App consumers.
    }
};
