<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

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
}
