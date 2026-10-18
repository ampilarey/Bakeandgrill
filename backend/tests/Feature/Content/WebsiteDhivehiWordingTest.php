<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentResolver;
use App\Domains\Content\DhivehiText;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The website's own wording in Dhivehi, lang/dv.json (iruali import plan, feature 3b). */
class WebsiteDhivehiWordingTest extends TestCase
{
    use RefreshDatabase;

    /** The public pages; the legal pages stay English until the owner types a Dhivehi text. */
    private const VIEWS = ['layout', 'home', 'menu', 'menu-item', 'contact', 'hours', 'prayer-times', 'offer'];

    public function test_every_wrapped_string_on_a_public_page_has_dhivehi(): void
    {
        $files = array_merge(
            array_map(fn (string $v) => resource_path("views/{$v}.blade.php"), self::VIEWS),
            glob(resource_path('views/partials/*.blade.php')) ?: [],
            glob(resource_path('views/partials/home/*.blade.php')) ?: [],
        );
        $missing = [];
        foreach ($files as $file) {
            preg_match_all("/__\\(\\s*'((?:[^'\\\\]|\\\\.)*)'/", (string) file_get_contents($file), $m);
            foreach ($m[1] as $key) {
                $key = str_replace("\\'", "'", $key);
                if (DhivehiText::of($key) === $key) {
                    $missing[] = basename($file) . ': ' . $key;
                }
            }
        }

        $this->assertSame([], $missing, 'add these to lang/dv.json');
    }

    public function test_a_dhivehi_page_reads_in_dhivehi_and_the_english_page_does_not(): void
    {
        SiteSetting::set('language_switcher_enabled', 'true', 'website', 'en');

        $this->get('/dv/hours')->assertOk()
            ->assertSee('ހުޅުވާ ގަޑިތައް')
            ->assertSee('ގުޅުއްވާ')
            ->assertDontSee('>Contact Us<', false);
        $this->get('/hours')->assertOk()
            ->assertSee('Contact Us')
            ->assertDontSee('ހުޅުވާ ގަޑިތައް');
    }

    public function test_built_in_english_reads_in_dhivehi_but_typed_english_stays(): void
    {
        $this->assertSame('ހުޅުވާ ގަޑިތައް', ContentResolver::for('website', 'dv')->get('no_such_block', 'Opening Hours'));
        $this->assertSame('Opening Hours', ContentResolver::for('website', 'en')->get('no_such_block', 'Opening Hours'));

        SiteSetting::set('hours_page_title', 'Our hours, typed by the owner', 'website', 'en');
        $this->assertSame('Our hours, typed by the owner', ContentResolver::for('website', 'dv')->get('hours_page_title'));
        SiteSetting::set('hours_page_title', 'ގަޑިތައް', 'website', 'dv');
        $this->assertSame('ގަޑިތައް', ContentResolver::for('website', 'dv')->get('hours_page_title'));
    }
}
