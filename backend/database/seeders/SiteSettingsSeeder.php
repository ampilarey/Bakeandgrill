<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\SiteSetting;
use Illuminate\Database\Seeder;

class SiteSettingsSeeder extends Seeder
{
    public function run(): void
    {
        $settings = [
            // General
            ['key' => 'site_name',        'type' => 'text',     'group' => 'General',  'label' => 'Site Name',         'description' => 'The name of your business', 'value' => 'Bake & Grill', 'is_public' => true],
            ['key' => 'site_tagline',     'type' => 'text',     'group' => 'General',  'label' => 'Tagline',           'description' => 'Short description shown in hero/header', 'value' => 'Fresh Baked, Fire Grilled', 'is_public' => true],
            ['key' => 'business_email',   'type' => 'text',     'group' => 'General',  'label' => 'Business Email',    'description' => null, 'value' => '', 'is_public' => true],
            ['key' => 'business_phone',   'type' => 'text',     'group' => 'General',  'label' => 'Business Phone',    'description' => null, 'value' => '', 'is_public' => true],
            ['key' => 'business_address', 'type' => 'textarea', 'group' => 'General',  'label' => 'Business Address',  'description' => null, 'value' => '', 'is_public' => true],
            ['key' => 'business_hours',   'type' => 'json',     'group' => 'General',  'label' => 'Business Hours',    'description' => 'Opening hours per day of week', 'value' => json_encode(['mon' => '8:00 AM - 8:00 PM', 'tue' => '8:00 AM - 8:00 PM', 'wed' => '8:00 AM - 8:00 PM', 'thu' => '8:00 AM - 8:00 PM', 'fri' => '8:00 AM - 8:00 PM', 'sat' => '9:00 AM - 6:00 PM', 'sun' => 'Closed']), 'is_public' => true],

            // Branding
            ['key' => 'logo',             'type' => 'image',    'group' => 'Branding', 'label' => 'Logo (Light)',      'description' => 'Used on light backgrounds', 'value' => null, 'is_public' => true],
            ['key' => 'logo_dark',        'type' => 'image',    'group' => 'Branding', 'label' => 'Logo (Dark)',       'description' => 'Used on dark backgrounds', 'value' => null, 'is_public' => true],
            ['key' => 'favicon',          'type' => 'image',    'group' => 'Branding', 'label' => 'Favicon',           'description' => '.ico or .png, 32x32px recommended', 'value' => null, 'is_public' => true],
            ['key' => 'primary_color',    'type' => 'color',    'group' => 'Branding', 'label' => 'Primary Color',     'description' => 'Main brand color', 'value' => '#D4813A', 'is_public' => true],
            ['key' => 'secondary_color',  'type' => 'color',    'group' => 'Branding', 'label' => 'Secondary Color',   'description' => 'Dark/accent color', 'value' => '#1C1408', 'is_public' => true],
            ['key' => 'accent_color',     'type' => 'color',    'group' => 'Branding', 'label' => 'Accent Color',      'description' => 'Subtle background tint', 'value' => '#F5E6D3', 'is_public' => true],

            // Footer
            ['key' => 'footer_text',      'type' => 'textarea', 'group' => 'Footer',   'label' => 'Footer Text',       'description' => 'Copyright or tagline in footer', 'value' => '© 2026 Bake & Grill. All rights reserved.', 'is_public' => true],
            ['key' => 'footer_links',     'type' => 'json',     'group' => 'Footer',   'label' => 'Footer Links',      'description' => 'JSON array of {label, url}', 'value' => json_encode([['label' => 'Privacy Policy', 'url' => '/privacy'], ['label' => 'Terms', 'url' => '/terms']]), 'is_public' => true],
            ['key' => 'show_social_links','type' => 'boolean',  'group' => 'Footer',   'label' => 'Show Social Links', 'description' => null, 'value' => 'true', 'is_public' => true],

            // Social Media
            ['key' => 'social_facebook',  'type' => 'text',     'group' => 'Social',   'label' => 'Facebook URL',      'description' => null, 'value' => '', 'is_public' => true],
            ['key' => 'social_instagram', 'type' => 'text',     'group' => 'Social',   'label' => 'Instagram URL',     'description' => null, 'value' => '', 'is_public' => true],
            ['key' => 'social_twitter',   'type' => 'text',     'group' => 'Social',   'label' => 'Twitter/X URL',     'description' => null, 'value' => '', 'is_public' => true],
            ['key' => 'social_tiktok',    'type' => 'text',     'group' => 'Social',   'label' => 'TikTok URL',        'description' => null, 'value' => '', 'is_public' => true],
            ['key' => 'social_youtube',   'type' => 'text',     'group' => 'Social',   'label' => 'YouTube URL',       'description' => null, 'value' => '', 'is_public' => true],

            // SEO
            ['key' => 'meta_title',       'type' => 'text',     'group' => 'SEO',      'label' => 'Meta Title',        'description' => 'Page title for search engines', 'value' => 'Bake & Grill — Fresh Baked, Fire Grilled', 'is_public' => true],
            ['key' => 'meta_description', 'type' => 'textarea', 'group' => 'SEO',      'label' => 'Meta Description',  'description' => 'Description for search results (150-160 chars)', 'value' => 'Your neighborhood cafe serving freshly baked goods and fire-grilled favorites in Malé, Maldives.', 'is_public' => true],
            ['key' => 'og_image',         'type' => 'image',    'group' => 'SEO',      'label' => 'OG Image',          'description' => 'Social share image (1200x630px)', 'value' => null, 'is_public' => true],
        ];

        foreach ($settings as $setting) {
            SiteSetting::updateOrCreate(
                ['key' => $setting['key']],
                $setting,
            );
        }
    }
}
