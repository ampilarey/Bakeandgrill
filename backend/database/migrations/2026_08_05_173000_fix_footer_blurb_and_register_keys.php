<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * footer_text was seeded as a copyright string but rendered as the brand blurb.
 * Clear legacy copyright values and ensure thank-you / trust keys exist.
 */
return new class extends Migration
{
    public function up(): void
    {
        $legacyCopyright = '© 2026 Bake & Grill. All rights reserved.';

        $existing = DB::table('site_settings')->where('key', 'footer_text')->value('value');
        if (is_string($existing) && (
            $existing === $legacyCopyright
            || str_contains($existing, '©')
            || str_contains(mb_strtolower($existing), 'all rights reserved')
        )) {
            DB::table('site_settings')->where('key', 'footer_text')->update([
                'value' => '',
                'label' => 'Footer blurb',
                'description' => 'Short brand line under the logo. Copyright is built separately.',
                'updated_at' => now(),
            ]);
        } else {
            DB::table('site_settings')->updateOrInsert(
                ['key' => 'footer_text'],
                [
                    'type' => 'textarea',
                    'group' => 'Footer',
                    'label' => 'Footer blurb',
                    'description' => 'Short brand line under the logo. Copyright is built separately.',
                    'value' => is_string($existing) ? $existing : '',
                    'is_public' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            );
        }

        $rows = [
            [
                'key' => 'footer_thanks',
                'value' => 'Thanks for choosing Bake & Grill — see you soon.',
                'type' => 'textarea',
                'group' => 'Footer',
                'label' => 'Footer thanks',
                'description' => 'Thank-you line in the footer',
            ],
            [
                'key' => 'footer_hours_heading',
                'value' => 'Opening Hours',
                'type' => 'text',
                'group' => 'Footer',
                'label' => 'Footer — Hours Heading',
                'description' => '',
            ],
            [
                'key' => 'footer_payments_text',
                'value' => 'BML · Cards · Cash · MVR',
                'type' => 'text',
                'group' => 'Footer',
                'label' => 'Footer — Payments line',
                'description' => '',
            ],
            [
                'key' => 'footer_delivery_text',
                'value' => 'Delivery across Malé & Hulhumalé',
                'type' => 'text',
                'group' => 'Footer',
                'label' => 'Footer — Delivery line',
                'description' => '',
            ],
            [
                'key' => 'footer_ramadan_note',
                'value' => 'Ramadan hours — open after Maghrib.',
                'type' => 'text',
                'group' => 'Footer',
                'label' => 'Footer — Ramadan note',
                'description' => '',
            ],
            [
                'key' => 'show_social_links',
                'value' => 'true',
                'type' => 'boolean',
                'group' => 'Footer',
                'label' => 'Show social links',
                'description' => '',
            ],
        ];

        foreach ($rows as $row) {
            $has = DB::table('site_settings')->where('key', $row['key'])->exists();
            if ($has) {
                continue;
            }
            DB::table('site_settings')->insert(array_merge($row, [
                'is_public' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]));
        }

        // Ensure footer_links default includes Refund when still on legacy 2-item JSON.
        $linksRaw = DB::table('site_settings')->where('key', 'footer_links')->value('value');
        $decoded = is_string($linksRaw) ? json_decode($linksRaw, true) : null;
        if (is_array($decoded) && count($decoded) === 2) {
            $urls = array_map(fn ($r) => is_array($r) ? (string) ($r['url'] ?? '') : '', $decoded);
            if (in_array('/privacy', $urls, true) && in_array('/terms', $urls, true) && ! in_array('/refund', $urls, true)) {
                $decoded[] = ['label' => 'Refund Policy', 'url' => '/refund'];
                DB::table('site_settings')->where('key', 'footer_links')->update([
                    'value' => json_encode($decoded),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        // Non-destructive — leave corrected values in place.
    }
};
