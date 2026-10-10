<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentResolver;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * UI audit, 2026-10-10: the Hours page showed "Contact page \xe2\x86\x92"
 * and "\xf0\x9f\x9b\x92 Order Online Now". An old setup step stored the
 * codes as text; this repair turns them back into what they spell.
 */
class DecodeEscapedBytesMigrationTest extends TestCase
{
    use RefreshDatabase;

    private function store(string $key, string $value): void
    {
        DB::table('site_settings')->where('key', $key)->delete();
        SiteSetting::set($key, $value);
    }

    /** The migration alone: it must clear the caches itself, as it does on deploy. */
    private function run_repair(): void
    {
        (require database_path('migrations/2026_10_10_100000_decode_escaped_bytes_in_site_settings.php'))->up();
    }

    public function test_stored_codes_become_the_characters_they_spell(): void
    {
        $this->store('hours_contact_page_label', 'Contact page \xe2\x86\x92');
        $this->store('hours_meta_title', 'Opening Hours \xe2\x80\x93 Bake & Grill');
        $this->store('hours_meta_description', 'Open 7 days a week in Mal\xc3\xa9, Maldives.');
        $this->store('hours_order_btn_label', '\xf0\x9f\x9b\x92 Order Online Now');

        $this->run_repair();

        $this->assertSame('Contact page →', SiteSetting::get('hours_contact_page_label'));
        $this->assertSame('Opening Hours – Bake & Grill', SiteSetting::get('hours_meta_title'));
        $this->assertSame('Open 7 days a week in Malé, Maldives.', SiteSetting::get('hours_meta_description'));
        // The button draws its own cart icon now.
        $this->assertSame('Order Online Now', SiteSetting::get('hours_order_btn_label'));
    }

    public function test_text_that_is_not_a_code_is_left_alone(): void
    {
        $this->store('footer_thanks', 'Thanks — see you soon at Bake & Grill');
        $this->store('contact_page_subtitle', 'Box \x41 is not UTF-8 on its own: \xff\xfe');

        $this->run_repair();

        $this->assertSame('Thanks — see you soon at Bake & Grill', SiteSetting::get('footer_thanks'));
        // "\x41" is a valid one-byte run ("A"), the broken pair stays as typed.
        $this->assertSame('Box A is not UTF-8 on its own: \xff\xfe', SiteSetting::get('contact_page_subtitle'));
    }

    public function test_a_wording_already_in_the_cache_shows_mended(): void
    {
        DB::table('site_settings')->where('key', 'hours_meta_title')->delete();
        SiteSetting::set('hours_meta_title', 'Opening Hours \xe2\x80\x93 Bake & Grill', 'website', 'en');
        // The page has been seen, so the codes sit in the forever cache.
        $this->assertSame(
            'Opening Hours \xe2\x80\x93 Bake & Grill',
            ContentResolver::for('website', 'en')->get('hours_meta_title'),
        );

        $this->run_repair();

        $this->assertSame('Opening Hours – Bake & Grill', ContentResolver::for('website', 'en')->get('hours_meta_title'));
    }

    public function test_the_hours_page_shows_an_arrow_not_codes(): void
    {
        $this->store('hours_contact_page_label', 'Contact page \xe2\x86\x92');
        $this->run_repair();

        $this->get('/hours')->assertOk()->assertSee('Contact page →')->assertDontSee('\xe2', false);
    }
}
