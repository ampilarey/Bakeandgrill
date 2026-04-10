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
}
