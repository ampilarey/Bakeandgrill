<?php

declare(strict_types=1);

use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $newSettings = [
            [
                'key' => 'menu_page_title',
                'value' => 'Our Complete Menu',
                'type' => 'text',
                'group' => 'Menu',
                'label' => 'Menu Page — Title',
                'description' => 'Headline on the public menu page',
                'is_public' => true,
            ],
            [
                'key' => 'menu_page_subtitle',
                'value' => 'Browse and add items to your cart',
                'type' => 'text',
                'group' => 'Menu',
                'label' => 'Menu Page — Subtitle',
                'description' => 'Supporting line under the menu page headline',
                'is_public' => true,
            ],
            [
                'key' => 'preorder_page_title',
                'value' => 'Pre-Order for Event',
                'type' => 'text',
                'group' => 'Pre-Order',
                'label' => 'Pre-Order — Page Title',
                'description' => 'Headline on the event pre-order form',
                'is_public' => true,
            ],
            [
                'key' => 'preorder_page_subtitle',
                'value' => 'Order in advance for events',
                'type' => 'text',
                'group' => 'Pre-Order',
                'label' => 'Pre-Order — Page Subtitle',
                'description' => 'Supporting line on the pre-order form',
                'is_public' => true,
            ],
            [
                'key' => 'preorder_submit_label',
                'value' => '📅 Submit Pre-Order',
                'type' => 'text',
                'group' => 'Pre-Order',
                'label' => 'Pre-Order — Submit Button',
                'description' => 'Label on the pre-order submit button',
                'is_public' => true,
            ],
            [
                'key' => 'preorder_confirm_title',
                'value' => 'Pre-Order Received!',
                'type' => 'text',
                'group' => 'Pre-Order',
                'label' => 'Pre-Order — Confirmation Title',
                'description' => 'Headline after a pre-order is submitted',
                'is_public' => true,
            ],
            [
                'key' => 'preorder_confirm_message',
                'value' => 'Your pre-order request has been submitted successfully.',
                'type' => 'text',
                'group' => 'Pre-Order',
                'label' => 'Pre-Order — Confirmation Message',
                'description' => 'Short message on the confirmation page',
                'is_public' => true,
            ],
            [
                'key' => 'preorder_confirm_steps',
                'value' => json_encode([
                    ['text' => 'Our team will review your request within a few hours.'],
                    ['text' => 'We will call you to confirm availability and final details.'],
                    ['text' => 'Payment is collected on delivery or pickup day.'],
                ]),
                'type' => 'json',
                'group' => 'Pre-Order',
                'label' => 'Pre-Order — What Happens Next (3 steps)',
                'description' => 'Numbered steps shown on the confirmation page',
                'is_public' => true,
            ],
            [
                'key' => 'about_page_title',
                'value' => 'About Bake & Grill',
                'type' => 'text',
                'group' => 'About',
                'label' => 'About Page — Title',
                'description' => 'Main heading on the order app About page',
                'is_public' => true,
            ],
            [
                'key' => 'about_page_story',
                'value' => "Bake & Grill was born out of a passion for honest, well-made food. We wanted to create a place where locals could gather for a proper breakfast, a quick lunch, or a relaxed dinner — without compromise on quality.\n\nLocated in the heart of Malé, we bring together traditional Dhivehi tastes and modern café culture under one roof. Every item on our menu is freshly prepared — from our morning pastries to our evening grill specials.",
                'type' => 'textarea',
                'group' => 'About',
                'label' => 'About Page — Our Story',
                'description' => 'Body text for the Our Story section (use {address} for business address)',
                'is_public' => true,
            ],
            [
                'key' => 'about_values',
                'value' => json_encode([
                    ['initial' => 'F', 'title' => 'Fresh Ingredients', 'description' => 'We source locally and prep daily. No shortcuts, no compromises.'],
                    ['initial' => 'C', 'title' => 'Community First', 'description' => 'We are part of Malé — we know our customers and they know us.'],
                    ['initial' => 'Q', 'title' => 'Quality Always', 'description' => "Whether it's a cup of tea or a full grill, everything gets the same care."],
                    ['initial' => 'B', 'title' => 'Built for Today', 'description' => 'Online ordering, table reservations, loyalty rewards — all in one place.'],
                ]),
                'type' => 'json',
                'group' => 'About',
                'label' => 'About Page — Values (4 items)',
                'description' => 'Value cards: initial letter, title, description',
                'is_public' => true,
            ],
            [
                'key' => 'order_checkout_title',
                'value' => 'Complete your order',
                'type' => 'text',
                'group' => 'Order App',
                'label' => 'Checkout — Title',
                'description' => 'Headline on the checkout page',
                'is_public' => true,
            ],
            [
                'key' => 'order_checkout_subtitle',
                'value' => 'Secure payment · Straight to the kitchen',
                'type' => 'text',
                'group' => 'Order App',
                'label' => 'Checkout — Subtitle',
                'description' => 'Supporting line under checkout headline',
                'is_public' => true,
            ],
            [
                'key' => 'order_payment_compliance',
                'value' => 'All prices in MVR. Payments are processed securely via Bank of Maldives (BML). Your card details are never stored on our servers.',
                'type' => 'textarea',
                'group' => 'Order App',
                'label' => 'Checkout — Payment Compliance Text',
                'description' => 'BML / MVR compliance note on checkout',
                'is_public' => true,
            ],
            [
                'key' => 'order_auth_privacy_line',
                'value' => 'Your number is used only for order updates. No spam.',
                'type' => 'text',
                'group' => 'Order App',
                'label' => 'Login — Privacy Line',
                'description' => 'Short trust message under OTP login',
                'is_public' => true,
            ],
            [
                'key' => 'home_hero_fallback_title',
                'value' => "Malé's neighbourhood café",
                'type' => 'text',
                'group' => 'Homepage',
                'label' => 'Hero Fallback — Title',
                'description' => 'Shown when no hero slides are configured',
                'is_public' => true,
            ],
            [
                'key' => 'home_hero_fallback_subtitle',
                'value' => 'Where Dhivehi breakfast meets artisan baking. Real food. Proper char. Baked fresh every morning at 5am.',
                'type' => 'textarea',
                'group' => 'Homepage',
                'label' => 'Hero Fallback — Subtitle',
                'description' => 'Supporting text when no hero slides are configured',
                'is_public' => true,
            ],
            [
                'key' => 'nav_order_cta_text',
                'value' => 'Order Now →',
                'type' => 'text',
                'group' => 'Footer',
                'label' => 'Nav — Order CTA Button',
                'description' => 'Primary order button in site header',
                'is_public' => true,
            ],
            [
                'key' => 'footer_quick_links_heading',
                'value' => 'Quick Links',
                'type' => 'text',
                'group' => 'Footer',
                'label' => 'Footer — Quick Links Heading',
                'description' => 'Column heading in site footer',
                'is_public' => true,
            ],
            [
                'key' => 'footer_location_heading',
                'value' => 'Location',
                'type' => 'text',
                'group' => 'Footer',
                'label' => 'Footer — Location Heading',
                'description' => 'Column heading in site footer',
                'is_public' => true,
            ],
            [
                'key' => 'footer_contact_heading',
                'value' => 'Contact',
                'type' => 'text',
                'group' => 'Footer',
                'label' => 'Footer — Contact Heading',
                'description' => 'Column heading in site footer',
                'is_public' => true,
            ],
            [
                'key' => 'footer_rights_suffix',
                'value' => 'All rights reserved.',
                'type' => 'text',
                'group' => 'Footer',
                'label' => 'Footer — Rights Suffix',
                'description' => 'Text after copyright year and business name',
                'is_public' => true,
            ],
            [
                'key' => 'home_open_badge_text',
                'value' => "We're open",
                'type' => 'text',
                'group' => 'Homepage',
                'label' => 'Home — Open Badge Text',
                'description' => 'Badge when the restaurant is open',
                'is_public' => true,
            ],
            [
                'key' => 'home_closed_badge_text',
                'value' => 'Closed now',
                'type' => 'text',
                'group' => 'Homepage',
                'label' => 'Home — Closed Badge Text',
                'description' => 'Badge when the restaurant is closed',
                'is_public' => true,
            ],
            [
                'key' => 'footer_text',
                'value' => '© 2026 Bake & Grill. All rights reserved.',
                'type' => 'textarea',
                'group' => 'Footer',
                'label' => 'Footer Text',
                'description' => 'Copyright or tagline in footer (order app)',
                'is_public' => true,
            ],
            [
                'key' => 'footer_links',
                'value' => json_encode([
                    ['label' => 'Privacy Policy', 'url' => '/privacy'],
                    ['label' => 'Terms', 'url' => '/terms'],
                ]),
                'type' => 'json',
                'group' => 'Footer',
                'label' => 'Footer Links',
                'description' => 'JSON array of {label, url} for footer quick links',
                'is_public' => true,
            ],
        ];

        foreach ($newSettings as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                array_merge($row, ['created_at' => now(), 'updated_at' => now()]),
            );
        }

        $publicKeys = [
            // Brand & contact
            'site_name', 'site_tagline', 'logo', 'favicon', 'business_phone', 'business_email',
            'business_address', 'business_landmark', 'business_maps_url', 'business_whatsapp', 'business_viber',
            'maps_embed_url', 'delivery_time', 'delivery_eta', 'delivery_threshold',
            // Hero & homepage
            'hero_slide_1', 'hero_slide_2', 'hero_slide_3', 'trust_items',
            'proof_stat', 'proof_label', 'proof_details', 'homepage_categories',
            'cta_band_headline', 'cta_band_subtext',
            'home_categories_eyebrow', 'home_categories_title', 'home_categories_subtitle',
            'home_featured_eyebrow_bestseller', 'home_featured_eyebrow_handpicked',
            'home_featured_title_bestseller', 'home_featured_title_handpicked', 'home_featured_subtitle',
            'home_location_eyebrow', 'home_location_title', 'home_location_subtitle',
            'home_proof_eyebrow', 'home_delivery_tagline', 'home_delivery_subtitle',
            'home_delivery_quality_line', 'home_delivery_payment_line',
            'home_hero_fallback_title', 'home_hero_fallback_subtitle',
            'home_open_badge_text', 'home_closed_badge_text',
            // Contact & hours pages
            'contact_page_eyebrow', 'contact_page_title', 'contact_page_subtitle',
            'contact_location_heading', 'contact_location_maps_label', 'contact_touch_heading',
            'contact_phone_label', 'contact_email_label', 'contact_whatsapp_label', 'contact_viber_label',
            'contact_hours_heading', 'contact_hours_fallback', 'contact_schedule_label',
            'contact_map_heading', 'contact_meta_title',
            'hours_page_eyebrow', 'hours_page_title', 'hours_page_note',
            'hours_page_cta_title', 'hours_page_cta_subtitle',
            'hours_meta_title', 'hours_meta_description', 'hours_special_closure_label',
            'hours_call_confirm_label', 'hours_contact_page_label', 'hours_order_btn_label',
            'hours_open_status_text', 'hours_closed_status_text',
            // Legal
            'privacy_page_title', 'privacy_email', 'privacy_email_label', 'privacy_phone_label',
            'privacy_address_label', 'privacy_last_updated_label',
            'terms_page_title', 'terms_page_subtitle', 'terms_page_corporate_service_text',
            'terms_phone_label', 'terms_email_label', 'terms_last_updated_label',
            'refund_page_title', 'refund_page_subtitle', 'refund_last_updated_label',
            'legal_privacy_body', 'legal_terms_body', 'legal_refund_body', 'legal_last_updated_date',
            // SEO & announcement
            'meta_title', 'meta_description', 'og_image',
            'announcement_enabled', 'announcement_text', 'announcement_url', 'announcement_style',
            // Office orders
            'office_orders_enabled', 'office_orders_headline', 'office_orders_subtext', 'office_orders_min_guests',
            // Footer & nav
            'footer_text', 'footer_links', 'nav_order_cta_text',
            'footer_quick_links_heading', 'footer_location_heading', 'footer_contact_heading', 'footer_rights_suffix',
            // New groups
            'menu_page_title', 'menu_page_subtitle',
            'preorder_page_title', 'preorder_page_subtitle', 'preorder_submit_label',
            'preorder_confirm_title', 'preorder_confirm_message', 'preorder_confirm_steps',
            'about_page_title', 'about_page_story', 'about_values',
            'order_checkout_title', 'order_checkout_subtitle', 'order_payment_compliance', 'order_auth_privacy_line',
        ];

        DB::table('site_settings')
            ->whereIn('key', $publicKeys)
            ->update(['is_public' => true, 'updated_at' => now()]);

        SiteSetting::bust();
    }

    public function down(): void
    {
        $removeKeys = [
            'menu_page_title', 'menu_page_subtitle',
            'preorder_page_title', 'preorder_page_subtitle', 'preorder_submit_label',
            'preorder_confirm_title', 'preorder_confirm_message', 'preorder_confirm_steps',
            'about_page_title', 'about_page_story', 'about_values',
            'order_checkout_title', 'order_checkout_subtitle', 'order_payment_compliance', 'order_auth_privacy_line',
            'home_hero_fallback_title', 'home_hero_fallback_subtitle',
            'nav_order_cta_text', 'footer_quick_links_heading', 'footer_location_heading',
            'footer_contact_heading', 'footer_rights_suffix',
            'home_open_badge_text', 'home_closed_badge_text',
        ];

        DB::table('site_settings')->whereIn('key', $removeKeys)->delete();
        SiteSetting::bust();
    }
};
