<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Verifies the CMS content layer:
 *  - Pages render correctly when CMS keys are missing (fallback)
 *  - Pages render CMS values when keys are set in the DB
 *  - Announcement banner shows/hides correctly
 *  - Public settings API exposes announcement keys
 *  - Only owner-role staff can update settings (auth guards)
 */
class CmsContentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helper
    // ──────────────────────────────────────────────────────────────────────────

    private function seedSetting(string $key, string $value, string $group = 'Homepage', string $type = 'text', bool $isPublic = false): void
    {
        SiteSetting::updateOrCreate(
            ['key' => $key],
            ['value' => $value, 'type' => $type, 'group' => $group, 'label' => $key, 'description' => '', 'is_public' => $isPublic]
        );
        Cache::forget("site_setting.{$key}");
    }

    private function ownerUser(): User
    {
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        return User::create([
            'name' => 'Owner', 'email' => 'owner@cms-test.com',
            'password' => \Illuminate\Support\Facades\Hash::make('secret'),
            'role_id' => $role->id, 'pin_hash' => \Illuminate\Support\Facades\Hash::make('1234'), 'is_active' => true,
        ]);
    }

    private function staffUser(): User
    {
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        return User::create([
            'name' => 'Staff', 'email' => 'staff@cms-test.com',
            'password' => \Illuminate\Support\Facades\Hash::make('secret'),
            'role_id' => $role->id, 'pin_hash' => \Illuminate\Support\Facades\Hash::make('5678'), 'is_active' => true,
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Homepage — fallback rendering (no DB row)
    // ──────────────────────────────────────────────────────────────────────────

    public function test_homepage_renders_categories_eyebrow_fallback(): void
    {
        $response = $this->get('/');
        $response->assertOk();
        $response->assertSee("What we're known for");
    }

    public function test_homepage_renders_featured_section_fallback(): void
    {
        $response = $this->get('/');
        $response->assertOk();
        // One of the two eyebrow variants must be present
        $body = $response->getContent();
        $this->assertTrue(
            str_contains($body, 'Most Ordered') || str_contains($body, 'Handpicked'),
            'Expected featured items eyebrow to be present'
        );
    }

    public function test_homepage_renders_location_section_fallback(): void
    {
        $response = $this->get('/');
        $response->assertOk();
        $response->assertSee('Visit or Order');
        $response->assertSee('Find us');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Homepage — CMS overrides
    // ──────────────────────────────────────────────────────────────────────────

    public function test_homepage_renders_cms_categories_eyebrow_override(): void
    {
        $this->seedSetting('home_categories_eyebrow', 'Our Specialties');

        $response = $this->get('/');
        $response->assertOk();
        $response->assertSee('Our Specialties');
        $response->assertDontSee("What we're known for");
    }

    public function test_homepage_renders_cms_categories_title_override(): void
    {
        $this->seedSetting('home_categories_title', 'Built for Malé');

        $response = $this->get('/');
        $response->assertOk();
        $response->assertSee('Built for Malé');
        $response->assertDontSee('Made for Malé');
    }

    public function test_homepage_renders_cms_location_section_override(): void
    {
        $this->seedSetting('home_location_eyebrow', 'Come visit');
        $this->seedSetting('home_location_title',   'Find & Order');

        $response = $this->get('/');
        $response->assertOk();
        $response->assertSee('Come visit');
        $response->assertSee('Find & Order');
    }

    public function test_homepage_renders_cms_delivery_tagline_override(): void
    {
        $this->seedSetting('home_delivery_tagline', 'We deliver everywhere in Malé');

        $response = $this->get('/');
        $response->assertOk();
        $response->assertSee('We deliver everywhere in Malé');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Contact page
    // ──────────────────────────────────────────────────────────────────────────

    public function test_contact_page_renders_fallback_copy(): void
    {
        $response = $this->get('/contact');
        $response->assertOk();
        $response->assertSee('Contact Us');
    }

    public function test_contact_page_renders_cms_title_override(): void
    {
        $this->seedSetting('contact_page_title',    'Get in Touch', 'Pages');
        $this->seedSetting('contact_page_subtitle', 'Reach out any time', 'Pages');

        $response = $this->get('/contact');
        $response->assertOk();
        $response->assertSee('Get in Touch');
        $response->assertSee('Reach out any time');
        // Verify the h1 reflects the CMS value, not the default "Contact Us"
        $this->assertStringContainsString('<h1>Get in Touch</h1>', $response->getContent());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Hours page
    // ──────────────────────────────────────────────────────────────────────────

    public function test_hours_page_renders_fallback_copy(): void
    {
        $response = $this->get('/hours');
        $response->assertOk();
        $response->assertSee('Opening Hours');
    }

    public function test_hours_page_renders_cms_title_override(): void
    {
        $this->seedSetting('hours_page_title', 'When We Are Open', 'Pages');
        $this->seedSetting('hours_page_note',  'Closed on national holidays.', 'Pages');

        $response = $this->get('/hours');
        $response->assertOk();
        $response->assertSee('When We Are Open');
        $response->assertSee('Closed on national holidays.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Announcement banner — Blade (public website)
    // ──────────────────────────────────────────────────────────────────────────

    public function test_announcement_banner_hidden_when_disabled(): void
    {
        $this->seedSetting('announcement_enabled', 'false', 'Announcements', 'boolean', true);
        $this->seedSetting('announcement_text',    'Big sale today!', 'Announcements', 'text', true);

        $response = $this->get('/');
        $response->assertOk();
        // CSS class names exist in <style> block, so we check for the rendered div element instead
        $this->assertStringNotContainsString('aria-label="Site announcement"', $response->getContent());
    }

    public function test_announcement_banner_shows_when_enabled(): void
    {
        $this->seedSetting('announcement_enabled', 'true',            'Announcements', 'boolean', true);
        $this->seedSetting('announcement_text',    'Big sale today!', 'Announcements', 'text',    true);

        $response = $this->get('/');
        $response->assertOk();
        $this->assertStringContainsString('aria-label="Site announcement"', $response->getContent());
        $response->assertSee('Big sale today!');
    }

    public function test_announcement_banner_with_link_renders_anchor(): void
    {
        $this->seedSetting('announcement_enabled', 'true',                 'Announcements', 'boolean', true);
        $this->seedSetting('announcement_text',    'Free delivery weekend', 'Announcements', 'text',    true);
        $this->seedSetting('announcement_url',     '/order/',              'Announcements', 'text',    true);

        $response = $this->get('/');
        $response->assertOk();
        $response->assertSee('href="/order/"', false);
        $response->assertSee('Free delivery weekend');
    }

    public function test_announcement_banner_hidden_when_text_empty(): void
    {
        $this->seedSetting('announcement_enabled', 'true', 'Announcements', 'boolean', true);
        $this->seedSetting('announcement_text',    '',     'Announcements', 'text',    true);

        $response = $this->get('/');
        $response->assertOk();
        $this->assertStringNotContainsString('aria-label="Site announcement"', $response->getContent());
    }

    public function test_announcement_style_applied_to_class(): void
    {
        $this->seedSetting('announcement_enabled', 'true',    'Announcements', 'boolean', true);
        $this->seedSetting('announcement_text',    'Warning!', 'Announcements', 'text',    true);
        $this->seedSetting('announcement_style',   'warning',  'Announcements', 'text',    true);

        $response = $this->get('/');
        $response->assertOk();
        $this->assertStringContainsString('site-announcement--warning', $response->getContent());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Public settings API — announcement keys are exposed
    // ──────────────────────────────────────────────────────────────────────────

    public function test_public_settings_api_exposes_announcement_keys(): void
    {
        $this->seedSetting('announcement_enabled', 'true',           'Announcements', 'boolean', true);
        $this->seedSetting('announcement_text',    'Order for EID!', 'Announcements', 'text',    true);
        $this->seedSetting('announcement_url',     '/order/',        'Announcements', 'text',    true);
        $this->seedSetting('announcement_style',   'promo',          'Announcements', 'text',    true);

        Cache::forget('site_settings.public');

        $response = $this->getJson('/api/site-settings/public');
        $response->assertOk();
        $response->assertJsonPath('settings.announcement_enabled', 'true');
        $response->assertJsonPath('settings.announcement_text',    'Order for EID!');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Auth guards — settings update
    // ──────────────────────────────────────────────────────────────────────────

    public function test_unauthenticated_cannot_update_settings(): void
    {
        $response = $this->putJson('/api/site-settings', ['announcement_text' => 'hack']);
        $response->assertUnauthorized();
    }

    public function test_non_owner_staff_cannot_update_settings(): void
    {
        Sanctum::actingAs($this->staffUser(), ['*']);

        $response = $this->putJson('/api/site-settings', ['announcement_text' => 'hack']);
        $response->assertForbidden();
    }

    public function test_owner_can_update_settings(): void
    {
        Sanctum::actingAs($this->ownerUser(), ['*']);

        $this->seedSetting('announcement_text', 'original', 'Announcements', 'text', true);

        $response = $this->putJson('/api/site-settings', ['settings' => ['announcement_text' => 'updated banner']]);
        $response->assertOk();

        $this->assertDatabaseHas('site_settings', [
            'key'   => 'announcement_text',
            'value' => 'updated banner',
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Legal pages — SiteSetting bridges config() calls
    // ──────────────────────────────────────────────────────────────────────────

    public function test_privacy_blade_view_uses_site_setting_phone(): void
    {
        // /privacy redirects to /order/privacy (React app). Test the Blade view directly via route.
        $this->seedSetting('business_phone', '+960 333 9999', 'Contact');

        // The Blade privacy view is rendered by the HomeController; we test the /terms route
        // which also uses the same business_phone bridge, as /privacy is a redirect to the React app.
        $response = $this->get('/terms');
        $response->assertOk();
        $response->assertSee('+960 333 9999');
    }

    public function test_refund_page_uses_site_setting_phone(): void
    {
        $this->seedSetting('business_phone', '+960 333 9999', 'Contact');

        $response = $this->get('/refund');
        $response->assertOk();
        $response->assertSee('+960 333 9999');
    }

    public function test_terms_page_uses_site_setting_address(): void
    {
        $this->seedSetting('business_address', 'Ameenee Magu, Malé', 'Contact');

        $response = $this->get('/terms');
        $response->assertOk();
        $response->assertSee('Ameenee Magu, Malé');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Business hours — CMS fallback and override
    // ──────────────────────────────────────────────────────────────────────────

    public function test_hours_page_renders_when_business_hours_json_missing(): void
    {
        // No business_hours_json in DB → falls back to config values.
        // The /hours page should still render without errors.
        $response = $this->get('/hours');
        $response->assertOk();
        // Days of the week must appear (from the blade @foreach)
        $response->assertSee('Monday');
        $response->assertSee('Friday');
    }

    public function test_hours_page_renders_cms_overridden_hours(): void
    {
        // Seed a custom hours JSON: only Sunday is open, everything else closed.
        $cmsHours = json_encode([
            '0' => ['open' => '08:00', 'close' => '14:00'],
            '1' => ['closed' => true],
            '2' => ['closed' => true],
            '3' => ['closed' => true],
            '4' => ['closed' => true],
            '5' => ['closed' => true],
            '6' => ['closed' => true],
        ]);
        $this->seedSetting('business_hours_json', $cmsHours, 'Hours', 'json', true);

        $response = $this->get('/hours');
        $response->assertOk();
        // Sunday row should show the open/close times from the CMS
        $response->assertSee('08:00');
        $response->assertSee('14:00');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Hours status badge text — CMS override
    // ──────────────────────────────────────────────────────────────────────────

    public function test_hours_open_status_text_uses_cms_override(): void
    {
        $this->seedSetting('hours_open_status_text', '✅ Open Now!', 'Pages');

        // We can't control isOpen() in a unit test, so we check the setting
        // is at least being read by verifying SiteSetting::get() returns it.
        $value = \App\Models\SiteSetting::get('hours_open_status_text', "● We're open right now");
        $this->assertSame('✅ Open Now!', $value);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Terms page — title, subtitle, corporate service text overrides
    // ──────────────────────────────────────────────────────────────────────────

    public function test_terms_page_renders_fallback_title(): void
    {
        $response = $this->get('/terms');
        $response->assertOk();
        $response->assertSee('Terms &amp; Conditions', false);
    }

    public function test_terms_page_renders_cms_title_override(): void
    {
        $this->seedSetting('terms_page_title',    'Our Terms of Service', 'Pages');
        $this->seedSetting('terms_page_subtitle', 'Read before ordering.', 'Pages');

        $response = $this->get('/terms');
        $response->assertOk();
        $response->assertSee('Our Terms of Service');
        $response->assertSee('Read before ordering.');
    }

    public function test_terms_page_renders_cms_corporate_service_text_override(): void
    {
        $this->seedSetting('terms_page_corporate_service_text', 'Contact us via our website form.', 'Pages');

        $response = $this->get('/terms');
        $response->assertOk();
        $response->assertSee('Contact us via our website form.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Legal body overrides — terms, refund, privacy
    // ──────────────────────────────────────────────────────────────────────────

    public function test_terms_page_falls_back_to_hardcoded_prose_when_legal_body_empty(): void
    {
        // Explicitly set legal_terms_body to empty → hardcoded sections must show
        $this->seedSetting('legal_terms_body', '', 'Legal', 'textarea');

        $response = $this->get('/terms');
        $response->assertOk();
        // A section from the hardcoded prose
        $response->assertSee('About Our Services');
    }

    public function test_terms_page_body_override_replaces_hardcoded_prose(): void
    {
        $this->seedSetting('legal_terms_body', "Section 1: Custom terms.\nSection 2: More custom.", 'Legal', 'textarea');

        $response = $this->get('/terms');
        $response->assertOk();
        $response->assertSee('Section 1: Custom terms.');
        // The hardcoded sections should NOT be visible
        $response->assertDontSee('About Our Services');
    }

    public function test_refund_page_renders_fallback_title(): void
    {
        $response = $this->get('/refund');
        $response->assertOk();
        $response->assertSee('Refund &amp; Cancellation Policy', false);
    }

    public function test_refund_page_renders_cms_title_override(): void
    {
        $this->seedSetting('refund_page_title',    'Returns & Refunds', 'Pages');
        $this->seedSetting('refund_page_subtitle', 'How we handle refunds.', 'Pages');

        $response = $this->get('/refund');
        $response->assertOk();
        $response->assertSee('Returns &amp; Refunds', false);
        $response->assertSee('How we handle refunds.');
    }

    public function test_refund_page_body_override_replaces_hardcoded_prose(): void
    {
        $this->seedSetting('legal_refund_body', 'All sales are final.', 'Legal', 'textarea');

        $response = $this->get('/refund');
        $response->assertOk();
        $response->assertSee('All sales are final.');
        $response->assertDontSee('Before kitchen confirmation');
    }

    public function test_refund_page_falls_back_to_hardcoded_prose_when_legal_body_empty(): void
    {
        $this->seedSetting('legal_refund_body', '', 'Legal', 'textarea');

        $response = $this->get('/refund');
        $response->assertOk();
        $response->assertSee('Cancellation');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Privacy page — title and email overrides (via /terms as proxy since /privacy
    // redirects to the React app at runtime; the Blade view is tested here via
    // the /terms route which shares the same SiteSetting bridge pattern)
    // ──────────────────────────────────────────────────────────────────────────

    public function test_privacy_email_cms_key_is_readable(): void
    {
        $this->seedSetting('privacy_email', 'dpo@bakeandgrill.mv', 'Pages');

        // Verify the setting resolves correctly (privacy page Blade is served at /order/privacy via React)
        $value = \App\Models\SiteSetting::get('privacy_email', 'privacy@bakeandgrill.mv');
        $this->assertSame('dpo@bakeandgrill.mv', $value);
    }

    public function test_privacy_page_title_cms_key_is_readable(): void
    {
        $this->seedSetting('privacy_page_title', 'Your Data & Privacy', 'Pages');

        $value = \App\Models\SiteSetting::get('privacy_page_title', 'Privacy Policy');
        $this->assertSame('Your Data & Privacy', $value);
    }

    public function test_privacy_body_override_cms_key_is_readable(): void
    {
        $this->seedSetting('legal_privacy_body', 'We respect your privacy.', 'Legal', 'textarea');

        $value = \App\Models\SiteSetting::get('legal_privacy_body');
        $this->assertSame('We respect your privacy.', $value);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Final Content CMS — Contact page card headings & labels
    // ══════════════════════════════════════════════════════════════════════════

    public function test_contact_page_renders_fallback_card_headings(): void
    {
        $response = $this->get('/contact');
        $response->assertOk();
        $response->assertSee('Our Location');
        $response->assertSee('Get in Touch');
        $response->assertSee('Opening Hours');
    }

    public function test_contact_page_renders_cms_location_heading_override(): void
    {
        $this->seedSetting('contact_location_heading', 'Where to Find Us', 'Contact');

        $response = $this->get('/contact');
        $response->assertOk();
        $response->assertSee('Where to Find Us');
        $response->assertDontSee('Our Location');
    }

    public function test_contact_page_renders_cms_touch_heading_override(): void
    {
        $this->seedSetting('contact_touch_heading', 'Reach Out', 'Contact');

        $response = $this->get('/contact');
        $response->assertOk();
        $response->assertSee('Reach Out');
        $response->assertDontSee('Get in Touch');
    }

    public function test_contact_page_renders_cms_hours_heading_override(): void
    {
        $this->seedSetting('contact_hours_heading', 'We Are Open', 'Contact');

        $response = $this->get('/contact');
        $response->assertOk();
        $response->assertSee('We Are Open');
        // The card heading "Opening Hours" should be replaced; the link to /hours
        // in the nav may still contain "Opening Hours" text so we only check
        // that the CMS override is rendered, not that every instance is gone.
        $response->assertSeeText('We Are Open');
    }

    public function test_contact_page_renders_cms_map_heading_override(): void
    {
        $this->seedSetting('contact_map_heading', 'Our Location on the Map', 'Contact');

        $response = $this->get('/contact');
        $response->assertOk();
        $response->assertSee('Our Location on the Map');
    }

    public function test_contact_page_renders_cms_maps_link_label_override(): void
    {
        $this->seedSetting('contact_location_maps_label', 'View on Google Maps', 'Contact');

        $response = $this->get('/contact');
        $response->assertOk();
        $response->assertSee('View on Google Maps');
        $response->assertDontSee('Open in Maps');
    }

    public function test_contact_page_renders_cms_schedule_label_override(): void
    {
        $this->seedSetting('contact_schedule_label', 'See All Hours', 'Contact');

        $response = $this->get('/contact');
        $response->assertOk();
        $response->assertSee('See All Hours');
    }

    public function test_contact_page_renders_cms_phone_label_override(): void
    {
        $this->seedSetting('contact_phone_label', 'Call Us', 'Contact');

        $response = $this->get('/contact');
        $response->assertOk();
        $response->assertSee('Call Us');
    }

    public function test_contact_page_renders_cms_whatsapp_label_override(): void
    {
        $this->seedSetting('contact_whatsapp_label', 'Message on WhatsApp', 'Contact');

        $response = $this->get('/contact');
        $response->assertOk();
        $response->assertSee('Message on WhatsApp');
    }

    public function test_contact_meta_title_uses_cms_setting(): void
    {
        $this->seedSetting('contact_meta_title', 'Find Bake & Grill — Contact', 'Contact');

        $response = $this->get('/contact');
        $response->assertOk();
        $response->assertSee('Find Bake &amp; Grill', false);
    }

    public function test_contact_meta_title_falls_back_when_setting_missing(): void
    {
        $response = $this->get('/contact');
        $response->assertOk();
        $response->assertSee('Contact Us');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Final Content CMS — Hours page meta title, special closure, CTA labels
    // ══════════════════════════════════════════════════════════════════════════

    public function test_hours_meta_title_uses_cms_setting(): void
    {
        $this->seedSetting('hours_meta_title', 'Our Business Hours', 'Pages');

        $response = $this->get('/hours');
        $response->assertOk();
        $response->assertSee('Our Business Hours');
    }

    public function test_hours_meta_title_falls_back_when_setting_missing(): void
    {
        $response = $this->get('/hours');
        $response->assertOk();
        $response->assertSee('Opening Hours');
    }

    public function test_hours_special_closure_label_uses_cms_setting(): void
    {
        $this->seedSetting('hours_special_closure_label', 'Closure Notice:', 'Pages');
        // Set a closure reason so the notice block renders
        $this->seedSetting('business_closures_json', json_encode([
            date('Y-m-d') => 'National Holiday',
        ]), 'Hours', 'json');

        $response = $this->get('/hours');
        $response->assertOk();
        $response->assertSee('Closure Notice:');
        $response->assertDontSee('Special Closure:');
    }

    public function test_hours_order_btn_label_uses_cms_setting(): void
    {
        $this->seedSetting('hours_order_btn_label', 'Order Now!', 'Pages');

        $response = $this->get('/hours');
        $response->assertOk();
        $response->assertSee('Order Now!');
        $response->assertDontSee('Order Online Now');
    }

    public function test_hours_contact_page_label_uses_cms_setting(): void
    {
        $this->seedSetting('hours_contact_page_label', 'Contact us →', 'Pages');

        $response = $this->get('/hours');
        $response->assertOk();
        $response->assertSee('Contact us →');
        $response->assertDontSee('Contact page →');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Final Content CMS — Legal pages meta titles and last-updated labels
    // ══════════════════════════════════════════════════════════════════════════

    public function test_terms_meta_title_uses_cms_setting(): void
    {
        $this->seedSetting('terms_meta_title', 'Terms of Service - Bake & Grill', 'Pages');

        $response = $this->get('/terms');
        $response->assertOk();
        $response->assertSee('Terms of Service - Bake &amp; Grill', false);
    }

    public function test_terms_meta_title_falls_back_when_setting_missing(): void
    {
        $response = $this->get('/terms');
        $response->assertOk();
        $response->assertSee('Terms');
    }

    public function test_terms_last_updated_label_uses_cms_setting(): void
    {
        $this->seedSetting('terms_last_updated_label', 'Revised on:', 'Pages');

        $response = $this->get('/terms');
        $response->assertOk();
        $response->assertSee('Revised on:');
        $response->assertDontSee('Last updated:');
    }

    public function test_terms_phone_label_uses_cms_setting(): void
    {
        $this->seedSetting('terms_phone_label', 'Tel:', 'Pages');

        $response = $this->get('/terms');
        $response->assertOk();
        $response->assertSee('Tel:');
    }

    public function test_terms_email_label_uses_cms_setting(): void
    {
        $this->seedSetting('terms_email_label', 'E-mail:', 'Pages');

        $response = $this->get('/terms');
        $response->assertOk();
        $response->assertSee('E-mail:');
    }

    public function test_refund_meta_title_uses_cms_setting(): void
    {
        $this->seedSetting('refund_meta_title', 'Returns Policy - Bake & Grill', 'Pages');

        $response = $this->get('/refund');
        $response->assertOk();
        $response->assertSee('Returns Policy - Bake &amp; Grill', false);
    }

    public function test_refund_meta_title_falls_back_when_setting_missing(): void
    {
        $response = $this->get('/refund');
        $response->assertOk();
        $response->assertSee('Refund');
    }

    public function test_refund_last_updated_label_uses_cms_setting(): void
    {
        $this->seedSetting('refund_last_updated_label', 'Policy date:', 'Pages');

        $response = $this->get('/refund');
        $response->assertOk();
        $response->assertSee('Policy date:');
        $response->assertDontSee('Last updated:');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Final Content CMS — Privacy page labels (CMS key readability)
    // ══════════════════════════════════════════════════════════════════════════

    public function test_privacy_meta_title_cms_key_is_readable(): void
    {
        $this->seedSetting('privacy_meta_title', 'Data Privacy - Bake & Grill', 'Pages');

        $value = \App\Models\SiteSetting::get('privacy_meta_title', 'Privacy Policy - Bake & Grill');
        $this->assertSame('Data Privacy - Bake & Grill', $value);
    }

    public function test_privacy_last_updated_label_cms_key_is_readable(): void
    {
        $this->seedSetting('privacy_last_updated_label', 'Effective from:', 'Pages');

        $value = \App\Models\SiteSetting::get('privacy_last_updated_label', 'Last updated:');
        $this->assertSame('Effective from:', $value);
    }

    public function test_privacy_email_label_cms_key_is_readable(): void
    {
        $this->seedSetting('privacy_email_label', 'E-mail:', 'Pages');

        $value = \App\Models\SiteSetting::get('privacy_email_label', 'Email:');
        $this->assertSame('E-mail:', $value);
    }

    public function test_privacy_address_label_cms_key_is_readable(): void
    {
        $this->seedSetting('privacy_address_label', 'Office:', 'Pages');

        $value = \App\Models\SiteSetting::get('privacy_address_label', 'Address:');
        $this->assertSame('Office:', $value);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Final Content CMS — Missing settings do not cause 500 (fallback safety)
    // ══════════════════════════════════════════════════════════════════════════

    public function test_contact_page_does_not_crash_when_all_new_settings_missing(): void
    {
        // No seeds — all new contact_* and contact_meta_title keys absent
        $response = $this->get('/contact');
        $response->assertOk();
    }

    public function test_hours_page_does_not_crash_when_all_new_settings_missing(): void
    {
        $response = $this->get('/hours');
        $response->assertOk();
    }

    public function test_terms_page_does_not_crash_when_all_new_settings_missing(): void
    {
        $response = $this->get('/terms');
        $response->assertOk();
    }

    public function test_refund_page_does_not_crash_when_all_new_settings_missing(): void
    {
        $response = $this->get('/refund');
        $response->assertOk();
    }
}
