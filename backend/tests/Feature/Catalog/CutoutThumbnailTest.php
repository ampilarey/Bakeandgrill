<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Domains\Catalog\Support\CutoutBackdrop;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\SiteSetting;
use App\Support\ItemDisplayPhoto;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-01, with the ZUS Coffee screenshots: a see-through cut-out
 * for the small cards, over a circle whose colour and strength can be set
 * for the whole menu, a category, a subcategory, or one item.
 */
class CutoutThumbnailTest extends TestCase
{
    use RefreshDatabase;

    private Category $parent;

    private Category $sub;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->parent = Category::create(['name' => 'Drinks', 'is_active' => true]);
        $this->sub = Category::create(['name' => 'Milk tea', 'is_active' => true, 'parent_id' => $this->parent->id]);
        $this->item = Item::create([
            'name' => 'Da Hong Pao', 'category_id' => $this->sub->id, 'base_price' => 45,
            'is_active' => true, 'is_available' => true,
        ]);
    }

    private function png(bool $transparent, int $size = 1200): UploadedFile
    {
        $image = imagecreatetruecolor($size, $size);
        imagealphablending($image, false);
        imagesavealpha($image, true);
        $fill = $transparent ? imagecolorallocatealpha($image, 0, 0, 0, 127) : imagecolorallocate($image, 255, 255, 255);
        imagefill($image, 0, 0, $fill);
        $cup = imagecolorallocate($image, 150, 40, 30);
        imagefilledellipse($image, (int) ($size / 2), (int) ($size / 2), (int) ($size / 2), (int) ($size / 1.4), $cup);
        $path = tempnam(sys_get_temp_dir(), 'cutout') . '.png';
        imagepng($image, $path);
        imagedestroy($image);

        return new UploadedFile($path, 'cup.png', 'image/png', null, true);
    }

    public function test_a_transparent_png_is_kept_see_through_and_resized(): void
    {
        $res = $this->post("/api/items/{$this->item->id}/cutout", ['cutout' => $this->png(true)])
            ->assertCreated();

        $url = $res->json('cutout_url');
        $this->assertStringStartsWith('/storage/menu-cutouts/', $url);
        $this->assertStringEndsWith('.png', $url);
        $relative = substr($url, strlen('/storage/'));
        Storage::disk('public')->assertExists($relative);

        $saved = imagecreatefrompng(Storage::disk('public')->path($relative));
        $this->assertSame(800, imagesx($saved), 'resized to the card bound');
        $corner = (imagecolorat($saved, 2, 2) >> 24) & 0x7F;
        $this->assertSame(127, $corner, 'the corner is still fully transparent');

        $this->assertSame($url, $this->item->fresh()->cutout_url);
    }

    public function test_a_flattened_image_is_refused_with_a_reason(): void
    {
        $this->post("/api/items/{$this->item->id}/cutout", ['cutout' => $this->png(false)])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'That file has no see-through background. Save it as a PNG with the background removed, then upload again.']);

        $this->assertNull($this->item->fresh()->cutout_url);
    }

    public function test_the_backdrop_resolves_item_over_category_over_parent_over_default(): void
    {
        SiteSetting::set(CutoutBackdrop::COLOR_KEY, '#EEEEEE', 'shared');
        SiteSetting::set(CutoutBackdrop::STRENGTH_KEY, '60', 'shared');
        SiteSetting::bust();

        $resolve = function (): array {
            $resolver = app(CutoutBackdrop::class);
            $resolver->forget();

            return $resolver->resolve($this->item->fresh());
        };

        $this->assertSame(['color' => '#EEEEEE', 'strength' => 60, 'source' => 'default'], $resolve());

        $this->patchJson("/api/categories/{$this->parent->id}", ['cutout_backdrop' => ['color' => '#112233']])->assertOk();
        $this->assertSame(['color' => '#112233', 'strength' => 60, 'source' => 'parent'], $resolve());

        $this->patchJson("/api/categories/{$this->sub->id}", ['cutout_backdrop' => ['strength' => 25]])->assertOk();
        $this->assertSame(['color' => '#112233', 'strength' => 25, 'source' => 'category'], $resolve());

        $this->patchJson("/api/items/{$this->item->id}/cutout/backdrop", ['backdrop' => ['color' => '#abcdef']])
            ->assertOk()
            ->assertJsonPath('backdrop.color', '#ABCDEF')
            ->assertJsonPath('effective.strength', 25)
            ->assertJsonPath('effective.source', 'item');

        // Clearing the item's own backdrop drops back to the category's.
        $this->patchJson("/api/items/{$this->item->id}/cutout/backdrop", ['backdrop' => null])
            ->assertOk()
            ->assertJsonPath('backdrop', null)
            ->assertJsonPath('effective.color', '#112233')
            ->assertJsonPath('effective.source', 'category');
    }

    public function test_cards_get_the_cut_out_and_the_resolved_backdrop_and_the_opened_item_keeps_its_photos(): void
    {
        $this->item->update(['image_url' => '/storage/menu/cup.jpg']);
        $this->post("/api/items/{$this->item->id}/cutout", ['cutout' => $this->png(true)])->assertCreated();
        $this->patchJson("/api/categories/{$this->sub->id}", ['cutout_backdrop' => ['color' => '#FFEEDD', 'strength' => 80]])->assertOk();

        $row = collect($this->getJson('/api/items')->assertOk()->json())
            ->flatten(1)->firstWhere('id', $this->item->id)
            ?? collect($this->getJson('/api/items')->json('data'))->firstWhere('id', $this->item->id);
        $this->assertNotNull($row);
        $this->assertStringStartsWith('/storage/menu-cutouts/', $row['cutout_url']);
        $this->assertSame(['color' => '#FFEEDD', 'strength' => 80, 'source' => 'category'], $row['cutout_backdrop']);
        $this->assertSame('/storage/menu/cup.jpg', $row['image_url'], 'the main photo is still the main photo');

        $display = app(ItemDisplayPhoto::class)->forItem($this->item->fresh()->load('photos'));
        $this->assertStringContainsString('/storage/menu-cutouts/', (string) $display['cutout']);
        $this->assertSame('#FFEEDD', $display['backdrop']['color']);
        $this->assertStringContainsString('/storage/menu/cup.jpg', (string) $display['url']);
    }

    public function test_the_website_menu_card_draws_the_cut_out_over_its_circle(): void
    {
        $this->post("/api/items/{$this->item->id}/cutout", ['cutout' => $this->png(true)])->assertCreated();
        $this->patchJson("/api/categories/{$this->parent->id}", ['cutout_backdrop' => ['color' => '#FFEEDD', 'strength' => 40]])->assertOk();

        $html = $this->get('/menu')->assertOk()->getContent();

        $this->assertStringContainsString('menu-card-circle-photo--cutout', $html);
        $this->assertStringContainsString('--cutout-color: #FFEEDD; --cutout-alpha: 0.40;', $html);
        $this->assertStringContainsString('/storage/menu-cutouts/', $html);
        $this->assertStringContainsString('data-cutout="1"', $html);

        // The item page is the opened item: photos, never the cut-out.
        $page = $this->get('/menu/' . $this->item->id)->assertOk()->getContent();
        $this->assertStringNotContainsString('menu-cutouts', $page);
    }

    public function test_removing_the_cut_out_deletes_its_files_and_the_card_falls_back(): void
    {
        $url = $this->post("/api/items/{$this->item->id}/cutout", ['cutout' => $this->png(true)])->json('cutout_url');
        $relative = substr($url, strlen('/storage/'));

        $this->deleteJson("/api/items/{$this->item->id}/cutout")->assertOk()->assertJsonPath('cutout_url', null);

        Storage::disk('public')->assertMissing($relative);
        $display = app(ItemDisplayPhoto::class)->forItem($this->item->fresh()->load('photos'));
        $this->assertNull($display['cutout']);
        $this->assertNull($display['backdrop']);
    }

    public function test_the_menu_defaults_are_business_details_fields(): void
    {
        $this->assertContains(CutoutBackdrop::COLOR_KEY, \App\Domains\Content\BusinessDetailsKeys::SECTIONS['menu_rules']);
        $this->assertTrue(\App\Domains\Content\BusinessDetailsKeys::sectionsCoverEveryKeyOnce());
        $this->assertSame('#F3EAE1', content(CutoutBackdrop::COLOR_KEY));
        $this->assertSame('100', (string) content(CutoutBackdrop::STRENGTH_KEY));
    }
}
