<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\BrandImages;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Media;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-10: "Fix" — the logo, dark logo, browser tab icon and link
 * preview were cut to the 4:3 menu crop and flattened onto white whichever
 * way they were set. Each is now kept in the shape its slot shows.
 */
class BrandImagesTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<string> Library files written outside the faked disk, removed in tearDown. */
    private array $written = [];

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        $owner = User::create([
            'name' => 'Brand Owner',
            'email' => 'brand-images@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);
    }

    protected function tearDown(): void
    {
        foreach (Media::query()->get() as $media) {
            foreach (['url', 'thumb_url', 'original_url', 'image_webp_url', 'thumb_webp_url'] as $field) {
                $this->written[] = (string) ($field === 'url' ? $media->url : $media->{$field});
            }
        }
        foreach (array_unique($this->written) as $url) {
            if (str_starts_with($url, '/storage/') && !str_contains($url, '..')) {
                @unlink(storage_path('app/public/' . substr($url, strlen('/storage/'))));
            }
        }
        parent::tearDown();
    }

    public function test_an_uploaded_logo_keeps_its_whole_shape_and_see_through_background(): void
    {
        $res = $this->uploadBrand('logo', $this->wideLogo(1000, 250))->assertCreated();

        $url = (string) $res->json('url');
        $this->assertStringStartsWith('/storage/site/brand/logo/', $url);
        $this->assertStringEndsWith('.png', $url);
        [$w, $h, $im] = $this->open($url);
        $this->assertSame([1000, 250], [$w, $h], 'not cut to 4:3');
        $this->assertSame(127, $this->alphaAt($im, 3, 3), 'the corner stays see-through');
        $this->assertSame(0, $this->alphaAt($im, 3, 125), 'the band reaches the left edge: nothing trimmed');
        $this->assertSame(0, $this->alphaAt($im, 996, 125), 'and the right edge');
        $this->assertDatabaseHas('media_assets', ['path' => substr($url, 9), 'source' => BrandImages::SOURCE, 'mime_type' => 'image/png']);
    }

    public function test_a_large_logo_is_scaled_down_whole(): void
    {
        $url = (string) $this->uploadBrand('logo_dark', $this->wideLogo(2400, 600))->assertCreated()->json('url');

        [$w, $h] = $this->open($url);
        $this->assertSame([1200, 300], [$w, $h]);
    }

    public function test_the_tab_icon_is_centred_on_a_clear_square(): void
    {
        $url = (string) $this->uploadBrand('favicon', $this->wideLogo(600, 300))->assertCreated()->json('url');

        [$w, $h, $im] = $this->open($url);
        $this->assertSame([512, 512], [$w, $h]);
        $this->assertSame(127, $this->alphaAt($im, 256, 20), 'padding above the logo is clear');
        $this->assertSame(0, $this->alphaAt($im, 3, 256), 'the logo spans the full width, centred');
    }

    public function test_the_link_preview_is_1200_by_630(): void
    {
        $url = (string) $this->uploadBrand('og_image', $this->photo(1600, 900))->assertCreated()->json('url');

        $this->assertStringEndsWith('.jpg', $url);
        [$w, $h] = $this->open($url);
        $this->assertSame([1200, 630], [$w, $h]);
    }

    public function test_business_details_turns_a_library_picture_into_a_proper_logo(): void
    {
        $asset = $this->uploadToLibrary($this->wideLogo(1000, 250));
        [$cw, $ch] = $this->open((string) $asset['url']);
        $this->assertSame([1200, 900], [$cw, $ch], 'the library crop itself is still the 4:3 menu shape');
        $this->assertStringEndsWith('.png', (string) $asset['original_url'], 'a see-through upload keeps a PNG master');

        $this->putJson('/api/admin/business-details', ['changes' => [
            ['key' => 'logo', 'value' => $asset['url']],
        ]])->assertOk();

        $stored = (string) SiteSetting::getScoped('logo', 'shared');
        $this->assertStringStartsWith('/storage/site/brand/logo/', $stored);
        [$w, $h, $im] = $this->open($stored);
        $this->assertSame([1000, 250], [$w, $h], 'drawn from the master: the whole logo');
        $this->assertSame(127, $this->alphaAt($im, 3, 3), 'still see-through');
    }

    public function test_use_as_link_preview_is_saved_in_the_preview_shape(): void
    {
        $asset = $this->uploadToLibrary($this->photo(1600, 900));

        $res = $this->postJson("/api/admin/media/{$asset['id']}/use-as", ['key' => 'og_image'])->assertOk();

        $stored = (string) SiteSetting::getScoped('og_image', 'shared');
        $this->assertSame($stored, $res->json('url'), 'the reply names what was stored');
        $this->assertStringStartsWith('/storage/site/brand/preview/', $stored);
        [$w, $h] = $this->open($stored);
        $this->assertSame([1200, 630], [$w, $h]);
    }

    public function test_the_same_picture_chosen_twice_makes_one_file(): void
    {
        $asset = $this->uploadToLibrary($this->wideLogo(800, 200));

        foreach (['logo', 'logo_dark', 'logo'] as $key) {
            $this->postJson("/api/admin/media/{$asset['id']}/use-as", ['key' => $key])->assertOk();
        }

        $this->assertSame(1, Media::query()->where('source', BrandImages::SOURCE)->count());
        $this->assertSame(SiteSetting::getScoped('logo', 'shared'), SiteSetting::getScoped('logo_dark', 'shared'));

        // Saving the stored rendition again leaves it alone.
        $stored = (string) SiteSetting::getScoped('logo', 'shared');
        $this->putJson('/api/admin/business-details', ['changes' => [['key' => 'logo', 'value' => $stored]]])->assertOk();
        $this->assertSame($stored, SiteSetting::getScoped('logo', 'shared'));
        $this->assertSame(1, Media::query()->where('source', BrandImages::SOURCE)->count());
    }

    public function test_built_in_files_blank_and_other_sites_are_left_alone(): void
    {
        foreach ([
            'logo' => '/brand/logo-light.png',
            'logo_dark' => '',
            'favicon' => '/favicon-32.png',
            'og_image' => 'https://cdn.example.com/preview.jpg',
        ] as $key => $value) {
            $this->putJson('/api/admin/business-details', ['changes' => [['key' => $key, 'value' => $value]]])->assertOk();
            $this->assertSame($value, (string) SiteSetting::getScoped($key, 'shared'), $key);
        }
        $this->assertSame(0, Media::query()->where('source', BrandImages::SOURCE)->count());
    }

    public function test_a_stored_file_that_will_not_decode_is_kept_rather_than_refusing_the_save(): void
    {
        Storage::disk('public')->put('library/broken.jpg', 'not a picture');

        $this->putJson('/api/admin/business-details', ['changes' => [
            ['key' => 'logo', 'value' => '/storage/library/broken.jpg'],
        ]])->assertOk();

        $this->assertSame('/storage/library/broken.jpg', SiteSetting::getScoped('logo', 'shared'));
    }

    public function test_menu_photos_still_get_the_4_by_3_crop(): void
    {
        $res = $this->post('/api/admin/content/upload', [
            'key' => 'default_item_image',
            'scope' => 'website',
            'file' => $this->photo(1600, 900),
        ], ['Accept' => 'application/json'])->assertCreated();
        $this->written[] = (string) $res->json('url');
        $this->written[] = (string) $res->json('thumb_url');
        $this->written[] = (string) $res->json('original_url');

        [$w, $h] = $this->open((string) $res->json('url'));
        $this->assertSame([1200, 900], [$w, $h]);
    }

    public function test_the_same_see_through_png_uploaded_again_gains_a_see_through_master(): void
    {
        $file = $this->wideLogo(900, 300);
        $asset = $this->uploadToLibrary($file);
        $this->written[] = (string) $asset['original_url'];
        // A row from before the fix: its master was flattened to JPEG.
        Media::query()->whereKey($asset['id'])->update(['original_url' => '/storage/library/images/masters/old.jpg']);

        $again = $this->uploadToLibrary(new UploadedFile($file->getRealPath(), 'logo-again.png', 'image/png', null, true));

        $this->assertSame($asset['id'], $again['id'], 'deduplicated to the same row');
        $this->assertStringEndsWith('.png', (string) Media::query()->find($asset['id'])->original_url);
    }

    public function test_saved_crops_are_redrawn_on_deploy(): void
    {
        $asset = $this->uploadToLibrary($this->wideLogo(1000, 250));
        SiteSetting::set('logo', (string) $asset['url'], 'shared');
        SiteSetting::set('favicon', '/favicon-32.png', 'shared');

        (require database_path('migrations/2026_10_10_210000_brand_pictures_in_their_own_shape.php'))->up();

        $logo = (string) SiteSetting::getScoped('logo', 'shared');
        $this->assertStringStartsWith('/storage/site/brand/logo/', $logo);
        [$w, $h] = $this->open($logo);
        $this->assertSame([1000, 250], [$w, $h]);
        $this->assertSame('/favicon-32.png', SiteSetting::getScoped('favicon', 'shared'));
    }

    public function test_replacing_the_logo_file_in_the_media_library_keeps_the_new_one_whole(): void
    {
        $url = (string) $this->uploadBrand('logo', $this->wideLogo(400, 100))->json('url');
        $this->putJson('/api/admin/business-details', ['changes' => [['key' => 'logo', 'value' => $url]]])->assertOk();
        $rendition = Media::query()->where('path', substr($url, 9))->firstOrFail();

        // The library's Replace writes its 4:3 crop and points every use at it.
        $this->post("/api/admin/media/{$rendition->id}/replace-file", ['file' => $this->wideLogo(900, 300)], ['Accept' => 'application/json'])
            ->assertOk();
        $fresh = Media::query()->findOrFail($rendition->id);
        $this->written[] = (string) $fresh->original_url;
        $this->written[] = (string) $fresh->thumb_url;

        $logo = (string) SiteSetting::getScoped('logo', 'shared');
        $this->assertNotSame($url, $logo);
        $this->assertStringStartsWith('/storage/site/brand/logo/', $logo);
        [$w, $h, $im] = $this->open($logo);
        $this->assertSame([900, 300], [$w, $h], 'redrawn whole from the new master, not the 4:3 crop');
        $this->assertSame(127, $this->alphaAt($im, 2, 2), 'and still see-through');
    }

    public function test_the_prune_keeps_a_brand_picture_in_use(): void
    {
        $url = (string) $this->uploadBrand('logo', $this->wideLogo(400, 100))->json('url');
        $this->putJson('/api/admin/business-details', ['changes' => [['key' => 'logo', 'value' => $url]]])->assertOk();
        touch(Storage::disk('public')->path(substr($url, 9)), time() - 30 * 86400);
        // A leftover nobody uses, in the same folder: the prune does run there.
        Storage::disk('public')->put('site/brand/logo/leftover.png', 'x');
        touch(Storage::disk('public')->path('site/brand/logo/leftover.png'), time() - 30 * 86400);

        Artisan::call('media:prune-unreferenced', ['--days' => 0]);

        Storage::disk('public')->assertExists(substr($url, 9));
        Storage::disk('public')->assertMissing('site/brand/logo/leftover.png');
    }

    // ── helpers ──────────────────────────────────────────────────────────

    private function uploadBrand(string $key, UploadedFile $file): \Illuminate\Testing\TestResponse
    {
        return $this->post('/api/admin/content/upload', [
            'key' => $key,
            'scope' => 'shared',
            'file' => $file,
        ], ['Accept' => 'application/json']);
    }

    /** @return array<string, mixed> */
    private function uploadToLibrary(UploadedFile $file): array
    {
        $res = $this->post('/api/admin/media', ['files' => [$file]], ['Accept' => 'application/json']);
        $this->assertContains($res->status(), [200, 201], (string) $res->getContent());
        $row = $res->json('data.0');

        return $row['asset'] ?? $row;
    }

    /** A see-through PNG with an opaque rust band from edge to edge across the middle. */
    private function wideLogo(int $w, int $h): UploadedFile
    {
        $im = imagecreatetruecolor($w, $h);
        imagealphablending($im, false);
        imagesavealpha($im, true);
        imagefilledrectangle($im, 0, 0, $w - 1, $h - 1, (int) imagecolorallocatealpha($im, 0, 0, 0, 127));
        imagefilledrectangle($im, 0, (int) ($h * 0.3), $w - 1, (int) ($h * 0.7), (int) imagecolorallocate($im, 183, 75, 12));
        $path = tempnam(sys_get_temp_dir(), 'brand') . '.png';
        imagepng($im, $path);
        imagedestroy($im);

        return new UploadedFile($path, 'logo.png', 'image/png', null, true);
    }

    private function photo(int $w, int $h): UploadedFile
    {
        $im = imagecreatetruecolor($w, $h);
        imagefilledrectangle($im, 0, 0, $w - 1, $h - 1, (int) imagecolorallocate($im, 40, 120, 220));
        $path = tempnam(sys_get_temp_dir(), 'brand') . '.jpg';
        imagejpeg($im, $path, 85);
        imagedestroy($im);

        return new UploadedFile($path, 'photo.jpg', 'image/jpeg', null, true);
    }

    /** @return array{0: int, 1: int, 2: \GdImage} */
    private function open(string $url): array
    {
        $relative = substr($url, strlen('/storage/'));
        $file = Storage::disk('public')->exists($relative)
            ? Storage::disk('public')->path($relative)
            : storage_path('app/public/' . $relative);
        $this->assertFileExists($file, $url);
        $im = imagecreatefromstring((string) file_get_contents($file));
        $this->assertNotFalse($im, $url);

        return [imagesx($im), imagesy($im), $im];
    }

    private function alphaAt(\GdImage $im, int $x, int $y): int
    {
        return (imagecolorat($im, $x, $y) >> 24) & 0x7F;
    }
}
