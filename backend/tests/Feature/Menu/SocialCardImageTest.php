<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Models\Category;
use App\Models\Item;
use App\Services\SocialCardImage;
use App\Support\SocialPreviewImage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Link previews only get the big card when the image is big enough, so
 * every item photo is served through a 1200x630 card. Owner, 2026-09-01:
 * a legacy 256x192 menu photo previewed as a postage stamp next to the
 * logo's full-width card.
 */
class SocialCardImageTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<string> */
    private array $written = [];

    protected function tearDown(): void
    {
        foreach ($this->written as $file) {
            @unlink($file);
        }
        foreach (Storage::disk('public')->files('social-cards') as $card) {
            Storage::disk('public')->delete($card);
        }
        parent::tearDown();
    }

    /** Writes a real JPEG into public/storage and returns its public path. */
    private function photo(int $width, int $height): string
    {
        $relative = 'menu/card-test-' . $width . 'x' . $height . '.jpg';
        $file = public_path('storage/' . $relative);
        @mkdir(dirname($file), 0775, true);

        $img = imagecreatetruecolor($width, $height);
        imagefilledrectangle($img, 0, 0, $width, $height, imagecolorallocate($img, 200, 120, 40));
        imagejpeg($img, $file, 85);
        imagedestroy($img);
        $this->written[] = $file;

        return '/storage/' . $relative;
    }

    private function item(string $imagePath): Item
    {
        $category = Category::create(['name' => 'Cards', 'slug' => 'cards', 'is_active' => true]);

        return Item::create([
            'category_id' => $category->id,
            'name' => 'Bajiya',
            'base_price' => 10.0,
            'sku' => 'CARD-' . uniqid(),
            'is_active' => true,
            'is_available' => true,
            'image_url' => $imagePath,
        ]);
    }

    public function test_a_small_legacy_photo_still_yields_a_full_size_card(): void
    {
        $item = $this->item($this->photo(256, 192));

        $preview = app(SocialPreviewImage::class)->forItem($item);

        $this->assertSame(SocialCardImage::WIDTH, $preview['width']);
        $this->assertSame(SocialCardImage::HEIGHT, $preview['height']);
        $this->assertStringContainsString('/storage/social-cards/', $preview['url']);

        $card = Storage::disk('public')->path('social-cards/' . basename($preview['url']));
        $this->assertFileExists($card);
        [$w, $h] = getimagesize($card);
        $this->assertSame([1200, 630], [$w, $h], 'crawlers need at least 600x315 for the big card');
    }

    public function test_the_card_is_rendered_once_and_reused(): void
    {
        $item = $this->item($this->photo(1200, 900));

        $first = app(SocialPreviewImage::class)->forItem($item)['url'];
        $card = Storage::disk('public')->path('social-cards/' . basename($first));
        $stamp = filemtime($card);

        $second = app(SocialPreviewImage::class)->forItem($item)['url'];

        $this->assertSame($first, $second, 'the card URL must be stable for crawler caches');
        $this->assertSame($stamp, filemtime($card), 'an existing card must not be re-rendered');
    }

    public function test_the_item_page_declares_the_card_size(): void
    {
        $item = $this->item($this->photo(256, 192));

        $html = $this->get('/menu/' . $item->id)->assertOk()->getContent();

        $this->assertStringContainsString('<meta property="og:image:width" content="1200">', $html);
        $this->assertStringContainsString('<meta property="og:image:height" content="630">', $html);
    }

    public function test_an_item_with_no_photo_still_shares_the_logo_untouched(): void
    {
        // The owner asked for the logo ONLY as the no-photo fallback; it is
        // already large and square, so it is not run through the renderer.
        $item = $this->item('');

        $preview = app(SocialPreviewImage::class)->forItem($item);

        $this->assertStringNotContainsString('/social-cards/', $preview['url']);
        $this->assertNull($preview['width']);
    }

    public function test_an_offsite_photo_is_used_as_is(): void
    {
        $item = $this->item('https://cdn.example.com/dish.jpg');

        $preview = app(SocialPreviewImage::class)->forItem($item);

        $this->assertSame('https://cdn.example.com/dish.jpg', $preview['url']);
        $this->assertNull($preview['width']);
    }

    public function test_a_replaced_photo_gets_a_new_card_url(): void
    {
        // Crawlers cache by URL: reusing one would keep showing the old dish.
        $path = $this->photo(300, 300);
        $item = $this->item($path);
        $before = app(SocialPreviewImage::class)->forItem($item)['url'];

        $file = public_path(ltrim($path, '/'));
        $img = imagecreatetruecolor(640, 480);
        imagejpeg($img, $file, 85);
        imagedestroy($img);
        clearstatcache(true, $file);
        touch($file, time() + 5);

        $after = app(SocialPreviewImage::class)->forItem($item)['url'];

        $this->assertNotSame($before, $after);
    }
}
