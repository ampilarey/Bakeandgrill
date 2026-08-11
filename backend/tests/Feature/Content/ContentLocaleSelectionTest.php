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
        SiteSetting::set('site_name', 'Bake English', 'shared', 'en');
        SiteSetting::set('site_name', 'ބޭކް ދިވެހި', 'shared', 'dv');

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
}
