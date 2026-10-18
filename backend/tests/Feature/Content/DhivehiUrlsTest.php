<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentResolver;
use App\Domains\Content\ContentWriter;
use App\Models\SiteSetting;
use App\Support\LocaleUrl;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Dhivehi addresses for public website pages (iruali import plan, feature 3b). */
class DhivehiUrlsTest extends TestCase
{
    use RefreshDatabase;

    private function dhivehi(bool $on): void
    {
        SiteSetting::set('language_switcher_enabled', $on ? 'true' : 'false', 'website', 'en');
    }

    public function test_switched_off_a_dv_address_goes_to_the_english_page(): void
    {
        $this->dhivehi(false);
        $this->get('/dv/menu')->assertStatus(302)->assertRedirect('/menu');
        $this->get('/dv')->assertRedirect('/');
    }

    public function test_switched_on_public_pages_answer_in_dhivehi_and_others_do_not(): void
    {
        $this->dhivehi(true);
        $this->get('/dv/hours')->assertOk()->assertSee('<html lang="dv" dir="rtl">', false)
            ->assertSee('<link rel="canonical" href="' . url('/dv/hours') . '">', false)
            ->assertSee('hreflang="en" href="' . url('/hours') . '"', false)
            ->assertSee('hreflang="x-default" href="' . url('/hours') . '"', false);
        $this->get('/hours')->assertOk()->assertSee('hreflang="dv" href="' . url('/dv/hours') . '"', false);

        $this->get('/dv/order/menu')->assertNotFound();
        $this->get('/dv/admin')->assertNotFound();
        $this->get('/dv/menu/print')->assertNotFound();
        $this->get('/hours?lang=dv&x=1')->assertStatus(301)->assertRedirect('/dv/hours?x=1');
    }

    public function test_the_sitemap_lists_dv_addresses(): void
    {
        $xml = $this->get('/sitemap.xml')->assertOk()->getContent();
        $this->assertStringContainsString('hreflang="dv" href="' . url('/dv/menu') . '"', $xml);
        $this->assertStringNotContainsString('lang=dv', $xml);
    }

    public function test_locale_url_maps_both_ways(): void
    {
        $this->assertSame('/dv/menu', LocaleUrl::to('/menu', 'dv'));
        $this->assertSame('/menu', LocaleUrl::to('/dv/menu', 'en'));
        $this->assertSame('/dv', LocaleUrl::to('/', 'dv'));
        $this->assertSame('/order/menu', LocaleUrl::to('/order/menu', 'dv'), 'not public: no dv address');
    }

    public function test_the_switch_is_one_switch_for_the_website_and_the_order_app(): void
    {
        // Saved from the order app's hub, it turns both on.
        app(ContentWriter::class)->write('language_switcher_enabled', 'order_app', 'true');
        $this->assertSame('true', SiteSetting::getScoped('language_switcher_enabled', 'website', 'en'));
        $this->assertSame('true', ContentResolver::for('order_app')->get('language_switcher_enabled'));

        // The order app follows the website even if its own row says otherwise.
        SiteSetting::set('language_switcher_enabled', 'false', 'website', 'en');
        $this->assertSame('false', ContentResolver::for('order_app')->get('language_switcher_enabled'));
    }

    public function test_the_prayer_times_page_reads_right_to_left_in_dhivehi(): void
    {
        $this->dhivehi(true);
        $this->get('/dv/prayer-times')->assertOk()->assertSee('<html lang="dv" dir="rtl">', false)
            ->assertSee('<link rel="canonical" href="' . url('/dv/prayer-times') . '">', false);
        $this->get('/prayer-times')->assertOk()->assertSee('<html lang="en" dir="ltr">', false);
    }
}
