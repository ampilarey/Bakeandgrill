<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The Dhivehi legal pages show only once approved (App\Support\LegalDhivehi). */
class LegalDhivehiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        SiteSetting::set('language_switcher_enabled', 'true', 'website', 'en');
    }

    public function test_until_approved_a_dhivehi_legal_page_shows_the_english_and_says_so(): void
    {
        foreach (['/dv/privacy' => 'Information We Collect', '/dv/terms' => 'About Our Services', '/dv/refund' => 'Refund Process'] as $url => $english) {
            $this->get($url)->assertOk()
                ->assertSee('legal-lang-note', false)
                ->assertSee('dir="ltr" lang="en"', false)
                ->assertSee($english);
        }
        $this->get('/terms')->assertOk()->assertDontSee('legal-lang-note', false)->assertSee('About Our Services');
    }

    public function test_once_approved_the_dhivehi_text_shows_and_english_pages_stay_english(): void
    {
        SiteSetting::set('legal_dv_approved', 'true', 'website', 'en');

        $this->get('/dv/privacy')->assertOk()->assertSee('އަހަރެމެން ނަގާ މަޢުލޫމާތު')->assertDontSee('Information We Collect')->assertDontSee('legal-lang-note', false);
        $this->get('/dv/terms')->assertOk()->assertSee('ޑެލިވަރީގެ ޕޮލިސީ')->assertSee('href="/dv/refund"', false);
        $this->get('/dv/refund')->assertOk()->assertSee('ރީފަންޑުގެ ތަރުތީބު');
        $this->get('/terms')->assertOk()->assertSee('About Our Services');
    }

    public function test_a_body_the_owner_typed_wins_over_both(): void
    {
        SiteSetting::set('legal_dv_approved', 'true', 'website', 'en');
        SiteSetting::set('legal_refund_body', 'ތަންކޮޅެއް އަމިއްލައަށް ލިޔުނު', 'website', 'dv');

        $this->get('/dv/refund')->assertOk()->assertSee('ތަންކޮޅެއް އަމިއްލައަށް ލިޔުނު')->assertDontSee('ރީފަންޑުގެ ތަރުތީބު');
    }
}
