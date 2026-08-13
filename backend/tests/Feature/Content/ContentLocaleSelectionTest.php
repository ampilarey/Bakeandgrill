<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentResolver;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class ContentLocaleSelectionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        ContentResolver::bust();
    }

    public function test_website_query_locale_renders_localized_content_and_sets_cookie(): void
    {
        SiteSetting::set('language_switcher_enabled', 'true', 'shared', 'en');
        SiteSetting::set('site_name', 'Bake English', 'website', 'en');
        SiteSetting::set('site_name', 'ބޭކް ދިވެހި', 'website', 'dv');

        $this->get('/?lang=dv')
            ->assertOk()
            ->assertCookie('content_locale', 'dv')
            ->assertSee('<html lang="dv" dir="rtl">', false)
            ->assertSee('ބޭކް ދިވެހި', false);

        $this->get('/?lang=en')
            ->assertOk()
            ->assertCookie('content_locale', 'en')
            ->assertSee('<html lang="en" dir="ltr">', false)
            ->assertSee('Bake English', false)
            ->assertDontSee('ބޭކް ދިވެހި', false);
    }

    public function test_language_switcher_off_forces_english_and_hides_toggle(): void
    {
        SiteSetting::set('language_switcher_enabled', 'false', 'shared', 'en');
        SiteSetting::set('site_name', 'Bake English', 'website', 'en');
        SiteSetting::set('site_name', 'ބޭކް ދިވެހި', 'website', 'dv');

        $this->withCookie('content_locale', 'dv')
            ->get('/?lang=dv')
            ->assertOk()
            ->assertCookie('content_locale', 'en')
            ->assertSee('<html lang="en" dir="ltr">', false)
            ->assertSee('Bake English', false)
            ->assertDontSee('ބޭކް ދިވެހި', false)
            ->assertDontSee('aria-label="Language"', false);
    }
}
