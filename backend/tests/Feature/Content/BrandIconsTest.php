<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Owner, 2026-10-07: "Have found that in some places it use old logo and
 * branding can u check all? … Pwa logo." Every app's home-screen icon was
 * the retired black square, and the driver app's icon was a text file.
 */
class BrandIconsTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{0: string}> */
    public static function manifests(): array
    {
        return [
            'order app' => ['order/manifest.json'],
            'admin' => ['admin/manifest.webmanifest'],
            'pos' => ['pos/manifest.webmanifest'],
            'pos (legacy)' => ['pos/manifest.json'],
            'kds' => ['kds/manifest.webmanifest'],
            'driver' => ['driver/manifest.webmanifest'],
        ];
    }

    /** @dataProvider manifests */
    public function test_every_app_icon_is_a_real_image_of_the_size_it_claims(string $manifest): void
    {
        $data = json_decode((string) file_get_contents(public_path($manifest)), true);
        $this->assertIsArray($data['icons'] ?? null, $manifest);
        $this->assertNotEmpty($data['icons']);
        $dir = dirname($manifest);
        foreach ($data['icons'] as $icon) {
            $src = (string) $icon['src'];
            $file = str_starts_with($src, '/') ? public_path(ltrim($src, '/')) : public_path($dir . '/' . $src);
            $this->assertFileExists($file, "$manifest → $src");
            $size = @getimagesize($file);
            $this->assertNotFalse($size, "$src is not an image");
            [$w, $h] = explode('x', (string) $icon['sizes']);
            $this->assertSame([(int) $w, (int) $h], [$size[0], $size[1]], "$src size");
            $this->assertStringNotContainsString('logo.png', $src, 'icons are the cream tiles, not the plain logo');
        }
        $this->assertContains('maskable', array_map(fn ($i) => $i['purpose'] ?? 'any', $data['icons']), "$manifest has a maskable icon");
    }

    public function test_touch_icons_are_opaque(): void
    {
        // iOS paints a see-through touch icon black: the old black square, again.
        foreach (['apple-touch-icon.png', 'admin/apple-touch-icon.png', 'pos/apple-touch-icon.png', 'kds/apple-touch-icon.png', 'order/apple-touch-icon.png', 'driver/apple-touch-icon.png'] as $path) {
            $im = imagecreatefrompng(public_path($path));
            $this->assertNotFalse($im, $path);
            $corner = imagecolorsforindex($im, imagecolorat($im, 0, 0));
            $this->assertSame(0, $corner['alpha'], "$path corner is opaque");
            $this->assertGreaterThan(200, $corner['red'], "$path is a cream tile, not black");
        }
    }

    public function test_saved_settings_naming_the_old_files_move_to_the_new_ones(): void
    {
        SiteSetting::set('favicon', '/logo.png');
        SiteSetting::set('logo', 'https://bakeandgrill.mv/logo.svg');
        SiteSetting::set('og_image', '/logo.png');
        SiteSetting::set('favicon', '/storage/media/our-own-icon.png', 'website');
        SiteSetting::set('logo_dark', '/brand/logo-dark.png');

        (require database_path('migrations/2026_10_08_120000_brand_icons_no_old_logo.php'))->up();
        SiteSetting::bust();

        $this->assertSame('/favicon-32.png', SiteSetting::get('favicon'));
        $this->assertSame('/brand/logo-light.png', SiteSetting::get('logo'));
        $this->assertSame('/brand/og-default.png', SiteSetting::get('og_image'));
        $this->assertSame('/brand/logo-dark.png', SiteSetting::get('logo_dark'), 'the dark logo file now holds the new artwork');
        $this->assertSame('/storage/media/our-own-icon.png', SiteSetting::query()->where('key', 'favicon')->where('scope', 'website')->value('value'), 'an uploaded image is left alone');
    }

    public function test_the_website_head_uses_the_new_icons(): void
    {
        $html = $this->get('/')->assertOk()->getContent();
        $this->assertStringContainsString('favicon-32.png', $html);
        $this->assertStringContainsString('apple-touch-icon.png', $html);
    }
}
