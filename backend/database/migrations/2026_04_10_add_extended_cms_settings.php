<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $settings = [

            // ─── Homepage copy ────────────────────────────────────────────────
            [
                'key'         => 'home_categories_eyebrow',
                'value'       => "What we're known for",
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'Categories Section — Eyebrow',
                'description' => 'Small label above the "Made for Malé" section title',
                'is_public'   => false,
            ],
            [
                'key'         => 'home_categories_title',
                'value'       => 'Made for Malé',
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'Categories Section — Title',
                'description' => 'Main heading of the signature categories section',
                'is_public'   => false,
            ],
            [
                'key'         => 'home_categories_subtitle',
                'value'       => 'Four things we do properly, every single day.',
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'Categories Section — Subtitle',
                'description' => 'Supporting line below the categories section title',
                'is_public'   => false,
            ],
            [
                'key'         => 'home_featured_eyebrow_bestseller',
                'value'       => '🔥 Most Ordered',
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'Featured Items — Eyebrow (has sales data)',
                'description' => 'Eyebrow shown when items have real sales data',
                'is_public'   => false,
            ],
            [
                'key'         => 'home_featured_eyebrow_handpicked',
                'value'       => '⭐ Handpicked',
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'Featured Items — Eyebrow (no sales data)',
                'description' => 'Eyebrow shown when no sales data yet',
                'is_public'   => false,
            ],
            [
                'key'         => 'home_featured_title_bestseller',
                'value'       => 'Best Sellers',
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'Featured Items — Title (has sales data)',
                'description' => 'Section title shown when items have real sales data',
                'is_public'   => false,
            ],
            [
                'key'         => 'home_featured_title_handpicked',
                'value'       => 'Featured Items',
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'Featured Items — Title (no sales data)',
                'description' => 'Section title shown when no sales data yet',
                'is_public'   => false,
            ],
            [
                'key'         => 'home_featured_subtitle',
                'value'       => 'The dishes our regulars order on repeat.',
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'Featured Items — Subtitle',
                'description' => 'Supporting line below the featured items section title',
                'is_public'   => false,
            ],
            [
                'key'         => 'home_location_eyebrow',
                'value'       => 'Find us',
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'Location Section — Eyebrow',
                'description' => 'Small label above the Visit or Order section',
                'is_public'   => false,
            ],
            [
                'key'         => 'home_location_title',
                'value'       => 'Visit or Order',
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'Location Section — Title',
                'description' => 'Main heading of the location/delivery section',
                'is_public'   => false,
            ],
            [
                'key'         => 'home_location_subtitle',
                'value'       => "Come in or stay in — we've got you covered either way.",
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'Location Section — Subtitle',
                'description' => 'Supporting line below the location section title',
                'is_public'   => false,
            ],
            [
                'key'         => 'home_proof_eyebrow',
                'value'       => 'Loved by Malé',
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'Social Proof — Eyebrow',
                'description' => 'Label above the big proof number in the dark strip',
                'is_public'   => false,
            ],
            [
                'key'         => 'home_delivery_tagline',
                'value'       => 'Delivery across all of Malé',
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'Delivery Card — Tagline',
                'description' => 'First line in the Order Delivery card on the homepage',
                'is_public'   => false,
            ],
            [
                'key'         => 'home_delivery_subtitle',
                'value'       => 'We come to you — no exceptions within the city',
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'Delivery Card — Subtitle',
                'description' => 'Small text below the delivery tagline',
                'is_public'   => false,
            ],
            [
                'key'         => 'home_delivery_quality_line',
                'value'       => 'Hot food at your door, not a cold box',
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'Delivery Card — Quality Line',
                'description' => 'Small text below the estimated delivery time',
                'is_public'   => false,
            ],
            [
                'key'         => 'home_delivery_payment_line',
                'value'       => 'BML online payment or cash on delivery',
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'Delivery Card — Payment Line',
                'description' => 'Small text below the free delivery threshold',
                'is_public'   => false,
            ],

            // ─── Pages group (contact & hours hero copy) ──────────────────────
            [
                'key'         => 'contact_page_eyebrow',
                'value'       => '📍 Find Us',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Contact Page — Hero Eyebrow',
                'description' => 'Small label above the main heading on the Contact page',
                'is_public'   => false,
            ],
            [
                'key'         => 'contact_page_title',
                'value'       => 'Contact Us',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Contact Page — Hero Title',
                'description' => 'Main h1 heading on the Contact page',
                'is_public'   => false,
            ],
            [
                'key'         => 'contact_page_subtitle',
                'value'       => "We'd love to hear from you — visit, call, or message us anytime",
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Contact Page — Hero Subtitle',
                'description' => 'Supporting paragraph below the Contact page title',
                'is_public'   => false,
            ],
            [
                'key'         => 'hours_page_eyebrow',
                'value'       => '🕐 Schedule',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Hours Page — Hero Eyebrow',
                'description' => 'Small label above the main heading on the Opening Hours page',
                'is_public'   => false,
            ],
            [
                'key'         => 'hours_page_title',
                'value'       => 'Opening Hours',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Hours Page — Hero Title',
                'description' => 'Main h1 heading on the Opening Hours page',
                'is_public'   => false,
            ],
            [
                'key'         => 'hours_page_note',
                'value'       => 'Hours may vary on public holidays.',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Hours Page — Holiday Note',
                'description' => 'Note shown below the hours table, before the phone number',
                'is_public'   => false,
            ],
            [
                'key'         => 'hours_page_cta_title',
                'value'       => 'Ready to order?',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Hours Page — CTA Title',
                'description' => 'Title of the order CTA block at the bottom of the hours page',
                'is_public'   => false,
            ],
            [
                'key'         => 'hours_page_cta_subtitle',
                'value'       => 'Place your order online and have it delivered fresh to your door',
                'type'        => 'text',
                'group'       => 'Pages',
                'label'       => 'Hours Page — CTA Subtitle',
                'description' => 'Supporting text in the order CTA block on the hours page',
                'is_public'   => false,
            ],

            // ─── Announcements group ──────────────────────────────────────────
            [
                'key'         => 'announcement_enabled',
                'value'       => 'false',
                'type'        => 'boolean',
                'group'       => 'Announcements',
                'label'       => 'Show Announcement Banner',
                'description' => 'When enabled, a banner is shown at the top of every page (website and order app)',
                'is_public'   => true,
            ],
            [
                'key'         => 'announcement_text',
                'value'       => '',
                'type'        => 'text',
                'group'       => 'Announcements',
                'label'       => 'Announcement — Text',
                'description' => 'The message shown in the banner (keep it short and clear)',
                'is_public'   => true,
            ],
            [
                'key'         => 'announcement_url',
                'value'       => '',
                'type'        => 'text',
                'group'       => 'Announcements',
                'label'       => 'Announcement — Link URL (optional)',
                'description' => 'If set, the entire banner becomes a clickable link to this URL',
                'is_public'   => true,
            ],
            [
                'key'         => 'announcement_style',
                'value'       => 'info',
                'type'        => 'text',
                'group'       => 'Announcements',
                'label'       => 'Announcement — Style',
                'description' => 'Visual style of the banner: info (blue), warning (amber), promo (green)',
                'is_public'   => true,
            ],
        ];

        foreach ($settings as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                array_merge($row, ['created_at' => now(), 'updated_at' => now()])
            );
        }
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', [
            // Homepage copy
            'home_categories_eyebrow', 'home_categories_title', 'home_categories_subtitle',
            'home_featured_eyebrow_bestseller', 'home_featured_eyebrow_handpicked',
            'home_featured_title_bestseller', 'home_featured_title_handpicked',
            'home_featured_subtitle', 'home_location_eyebrow', 'home_location_title',
            'home_location_subtitle', 'home_proof_eyebrow', 'home_delivery_tagline',
            'home_delivery_subtitle', 'home_delivery_quality_line', 'home_delivery_payment_line',
            // Pages
            'contact_page_eyebrow', 'contact_page_title', 'contact_page_subtitle',
            'hours_page_eyebrow', 'hours_page_title', 'hours_page_note',
            'hours_page_cta_title', 'hours_page_cta_subtitle',
            // Announcements
            'announcement_enabled', 'announcement_text', 'announcement_url', 'announcement_style',
        ])->delete();
    }
};
