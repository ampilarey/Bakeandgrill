<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $settings = [

            // ─── Contact Group ─────────────────────────────────────────────
            [
                'key'         => 'business_whatsapp',
                'value'       => 'https://wa.me/9609120011',
                'type'        => 'text',
                'group'       => 'Contact',
                'label'       => 'WhatsApp Link',
                'description' => 'Full WhatsApp URL, e.g. https://wa.me/9609120011',
                'is_public'   => true,
            ],
            [
                'key'         => 'business_viber',
                'value'       => 'viber://chat?number=9609120011',
                'type'        => 'text',
                'group'       => 'Contact',
                'label'       => 'Viber Link',
                'description' => 'Viber deep link, e.g. viber://chat?number=9609120011',
                'is_public'   => true,
            ],
            [
                'key'         => 'business_maps_url',
                'value'       => 'https://maps.google.com/?q=Kalaafaanu+Hingun+Male+Maldives',
                'type'        => 'text',
                'group'       => 'Contact',
                'label'       => 'Google Maps URL',
                'description' => 'Full Google Maps link to your location',
                'is_public'   => true,
            ],
            [
                'key'         => 'business_landmark',
                'value'       => 'Near H. Sahara',
                'type'        => 'text',
                'group'       => 'Contact',
                'label'       => 'Landmark / Direction Hint',
                'description' => 'Short landmark shown near the address, e.g. Near H. Sahara',
                'is_public'   => true,
            ],
            [
                'key'         => 'delivery_threshold',
                'value'       => 'MVR 200',
                'type'        => 'text',
                'group'       => 'Contact',
                'label'       => 'Free Delivery Threshold',
                'description' => 'Amount above which delivery is free, e.g. MVR 200',
                'is_public'   => true,
            ],
            [
                'key'         => 'delivery_time',
                'value'       => '30–45 min',
                'type'        => 'text',
                'group'       => 'Contact',
                'label'       => 'Delivery Time Promise',
                'description' => 'Estimated delivery time shown on the website, e.g. 30–45 min',
                'is_public'   => true,
            ],

            // ─── Hero Group ────────────────────────────────────────────────
            [
                'key'   => 'hero_slide_1',
                'value' => json_encode([
                    'image'     => '/images/cafe/WhatsApp_Image_2026-01-30_at_19.34.49-ffb9abd7-f645-48ef-a78b-f1b36191f0b3.png',
                    'eyebrow'   => "Malé's neighbourhood café",
                    'title'     => 'Where Dhivehi breakfast<br>meets <em>artisan baking</em>',
                    'subtitle'  => 'Real food. Proper char. Baked fresh every morning at 5am.',
                    'cta_text'  => 'Order Now →',
                    'cta_url'   => '/order/',
                    'cta2_text' => 'View Menu',
                    'cta2_url'  => '/menu',
                ]),
                'type'        => 'json',
                'group'       => 'Hero',
                'label'       => 'Hero Slide 1',
                'description' => 'First hero carousel slide — image, headline and CTA buttons',
                'is_public'   => false,
            ],
            [
                'key'   => 'hero_slide_2',
                'value' => json_encode([
                    'image'     => '/images/cafe/WhatsApp_Image_2026-01-30_at_19.34.57-1d4f7fc3-8bca-4e81-bdb4-12a8dceb7dc0.png',
                    'eyebrow'   => 'Signature Hedhikaa',
                    'title'     => 'The breakfast your<br>grandmother <em>made</em>',
                    'subtitle'  => 'Bajiya, gulha, mas roshi — ready by 7am, made the right way.',
                    'cta_text'  => 'Order Hedhikaa →',
                    'cta_url'   => '/order/',
                    'cta2_text' => 'Browse Menu',
                    'cta2_url'  => '/menu',
                ]),
                'type'        => 'json',
                'group'       => 'Hero',
                'label'       => 'Hero Slide 2',
                'description' => 'Second hero carousel slide',
                'is_public'   => false,
            ],
            [
                'key'   => 'hero_slide_3',
                'value' => json_encode([
                    'image'     => '/images/cafe/WhatsApp_Image_2026-01-30_at_19.34.55__1_-a88c997c-ebaa-4efc-a50d-11b8b178fd36.png',
                    'eyebrow'   => 'Fresh Pastries & Bakes',
                    'title'     => 'Croissants that crackle.<br><em>Baked at dawn.</em>',
                    'subtitle'  => 'Free delivery on orders over MVR 200. Delivered hot across all of Malé.',
                    'cta_text'  => 'Start Your Order →',
                    'cta_url'   => '/order/',
                    'cta2_text' => 'View Pastries',
                    'cta2_url'  => '/menu',
                ]),
                'type'        => 'json',
                'group'       => 'Hero',
                'label'       => 'Hero Slide 3',
                'description' => 'Third hero carousel slide',
                'is_public'   => false,
            ],

            // ─── Homepage Group ────────────────────────────────────────────
            [
                'key'   => 'trust_items',
                'value' => json_encode([
                    ['icon' => '🌅', 'heading' => 'Baked fresh at 5am daily', 'subtext' => "Never yesterday's pastry"],
                    ['icon' => '🏠', 'heading' => 'Family-owned', 'subtext' => 'Neighbourhood kitchen, Malé'],
                    ['icon' => '⚡', 'heading' => '30–45 min delivery', 'subtext' => 'Anywhere in Malé'],
                    ['icon' => '💬', 'heading' => 'WhatsApp & Viber', 'subtext' => '+960 9120011'],
                ]),
                'type'        => 'json',
                'group'       => 'Homepage',
                'label'       => 'Trust Strip — 4 Items',
                'description' => 'Four trust points shown in the strip below the hero banner',
                'is_public'   => false,
            ],
            [
                'key'         => 'proof_stat',
                'value'       => '500+',
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'Social Proof — Main Stat',
                'description' => 'The big number shown in the dark social proof section, e.g. 500+',
                'is_public'   => false,
            ],
            [
                'key'         => 'proof_label',
                'value'       => 'orders delivered in Malé every week — and counting.',
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'Social Proof — Label',
                'description' => 'Text shown beneath the big proof number',
                'is_public'   => false,
            ],
            [
                'key'   => 'proof_details',
                'value' => json_encode([
                    ['value' => '5am',       'label' => 'Baking starts'],
                    ['value' => '30–45 min', 'label' => 'Average delivery'],
                    ['value' => 'MVR 200',   'label' => 'Free delivery above'],
                ]),
                'type'        => 'json',
                'group'       => 'Homepage',
                'label'       => 'Social Proof — 3 Detail Stats',
                'description' => 'Three small stat callouts below the main proof number',
                'is_public'   => false,
            ],
            [
                'key'   => 'homepage_categories',
                'value' => json_encode([
                    ['icon' => '🥐', 'label' => 'Hedhikaa',             'name' => 'Dhivehi Breakfast',  'hook' => 'The breakfast your grandmother made, ready by 7am.',          'image_url' => '/images/cafe/Bajiya.png',    'link' => '/menu'],
                    ['icon' => '🥐', 'label' => 'Pastries & Bakes',     'name' => 'Fresh Bakes',         'hook' => 'Croissants that crackle. Cream buns that melt. Baked at dawn.', 'image_url' => '/images/cafe/Cream-bun.png', 'link' => '/menu'],
                    ['icon' => '🔥', 'label' => 'Grills',               'name' => 'Char & Grill',        'hook' => 'Proper char. Proper flavor. Made to order, never pre-cooked.',   'image_url' => '',                           'link' => '/menu'],
                    ['icon' => '🎂', 'label' => 'Cakes & Special Orders','name' => 'Celebration Cakes',  'hook' => 'Celebration-worthy. Made to order. Call ahead to reserve yours.', 'image_url' => '/images/cafe/G-cake.png',   'link' => '/menu'],
                ]),
                'type'        => 'json',
                'group'       => 'Homepage',
                'label'       => 'Category Cards — 4 Items',
                'description' => 'The four signature category cards on the homepage',
                'is_public'   => false,
            ],
            [
                'key'         => 'cta_band_headline',
                'value'       => 'Hungry? <em>Order now.</em>',
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'CTA Band — Headline',
                'description' => 'Big headline at the bottom of the home page. HTML allowed, e.g. Hungry? <em>Order now.</em>',
                'is_public'   => false,
            ],
            [
                'key'         => 'cta_band_subtext',
                'value'       => 'Fresh from our kitchen to your door in 30–45 minutes. No fuss, no wait — just real food.',
                'type'        => 'text',
                'group'       => 'Homepage',
                'label'       => 'CTA Band — Subtext',
                'description' => 'Supporting paragraph beneath the CTA headline',
                'is_public'   => false,
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
            'business_whatsapp', 'business_viber', 'business_maps_url',
            'business_landmark', 'delivery_threshold', 'delivery_time',
            'hero_slide_1', 'hero_slide_2', 'hero_slide_3',
            'trust_items', 'proof_stat', 'proof_label', 'proof_details',
            'homepage_categories', 'cta_band_headline', 'cta_band_subtext',
        ])->delete();
    }
};
