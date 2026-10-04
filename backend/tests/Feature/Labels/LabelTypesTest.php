<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\LabelBrand;
use App\Models\LabelType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Label Hub v2, step 1 (docs/LABEL_HUB_V2_PLAN.md): label types ("frozen
 * hedika is a type of food so that label should be easily selected") and
 * brands ("amma brand is a specific food under bake and grill").
 */
class LabelTypesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Storage::fake('public');
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    public function test_the_first_types_and_brands_come_from_the_migration(): void
    {
        $types = $this->getJson('/api/labels/types')->assertOk()->json('data');
        $this->assertSame(['Frozen Hedhika', 'Chilled Hedhika', 'Fresh Hedhika'], array_column($types, 'name'));
        $this->assertSame('FROZEN HEDHIKA', $types[0]['heading']);
        $this->assertSame('BEST BEFORE', $types[1]['exp_label']);
        $this->assertSame('Use within 2 days of opening', $types[1]['use_within']);

        $brands = $this->getJson('/api/labels/brands')->assertOk()->json('data');
        $this->assertSame(['Bake & Grill', 'Amma'], array_column($brands, 'name'));
        $this->assertTrue($brands[0]['is_default']);
        $this->assertSame('/brand/logo-light.png', $brands[0]['logo_url']);
        // Amma's badge ships in the brand pack, so it prints before anyone uploads a logo.
        $this->assertSame('/brand/amma-logo.png', $brands[1]['logo_url']);
        $this->assertNotSame(app(\App\Domains\Labels\LabelTypes::class)->brand(LabelBrand::query()->where('name', 'Amma')->first())['logo'], app(\App\Domains\Labels\LabelTypes::class)->brand(null)['logo']);
    }

    public function test_an_item_picks_a_type_and_its_sticker_takes_the_wording_and_shelf_life(): void
    {
        $chilled = LabelType::query()->where('storage', 'chilled')->firstOrFail();
        $item = $this->makeItem(false, 0, ['name' => 'Chocolate Cake', 'label_enabled' => true, 'label_ingredients_source' => 'manual', 'label_ingredients' => 'Flour, sugar']);

        $this->putJson("/api/items/{$item->id}/label", ['label_type_id' => $chilled->id, 'label_storage' => 'chilled'])->assertOk()
            ->assertJsonPath('data.label_type_name', 'Chilled Hedhika')
            ->assertJsonPath('data.defaults.heading', 'CHILLED HEDHIKA')
            ->assertJsonPath('data.defaults.shelf_life_days', 3);

        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $item->id, 'copies' => 1]], 'fill' => true, 'mfg' => '2026-10-04'])->assertOk();
        $this->assertSame('2026-10-07', $res->json('summary.products.0.exp'), 'shelf life from the type');
        $html = (string) $this->get($res->json('view_url'))->getContent();
        $this->assertStringContainsString('CHILLED', $html);

        // Its own wording still wins over the type's.
        $this->putJson("/api/items/{$item->id}/label", ['label_heading' => 'BAKERY CAKE', 'label_shelf_life_days' => 5])->assertOk();
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $item->id, 'copies' => 1]], 'fill' => true, 'mfg' => '2026-10-04'])->assertOk();
        $this->assertSame('2026-10-09', $res->json('summary.products.0.exp'));
        $this->assertStringContainsString('BAKERY', (string) $this->get($res->json('view_url'))->getContent());

        // A whole sheet printed "as" another type.
        $frozen = LabelType::query()->where('storage', 'frozen')->firstOrFail();
        $plain = $this->makeItem(false, 0, ['name' => 'Patties', 'label_enabled' => true, 'label_storage' => 'frozen']);
        // (compact stock: the heading is on one line there; the full sticker splits it over two)
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $plain->id, 'copies' => 1]], 'type' => $chilled->id, 'layout' => 'a4-12'])->assertOk();
        $html = (string) $this->get($res->json('view_url'))->getContent();
        $this->assertStringContainsString('CHILLED HEDHIKA', $html);
        $this->assertStringNotContainsString('FROZEN HEDHIKA', $html);
        $this->assertStringContainsString('KEEP FROZEN', $html, 'the item is still kept frozen, so its storage line stays');
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $plain->id, 'copies' => 1]], 'type' => $frozen->id, 'layout' => 'a4-12'])->assertOk();
        $this->assertStringContainsString('FROZEN HEDHIKA', (string) $this->get($res->json('view_url'))->getContent());
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $plain->id, 'copies' => 1]], 'type' => 999])->assertUnprocessable();
    }

    public function test_types_and_brands_are_managed_with_labels_manage(): void
    {
        $amma = LabelBrand::query()->where('name', 'Amma')->firstOrFail();
        $type = $this->postJson('/api/labels/types', [
            'name' => 'Amma Pickles', 'heading' => 'AMMA PICKLES', 'brand_id' => $amma->id, 'storage' => 'ambient',
            'how_to_use' => 'Serve with rice. Keep the lid closed.', 'use_within' => 'Use within a month of opening', 'exp_label' => 'BEST BEFORE', 'shelf_life_days' => 180,
        ])->assertCreated()->assertJsonPath('data.brand_name', 'Amma')->json('data');
        $this->putJson("/api/labels/types/{$type['id']}", ['heading' => 'AMMA ACHAARU', 'show_qr' => false])->assertOk()
            ->assertJsonPath('data.heading', 'AMMA ACHAARU')->assertJsonPath('data.show_qr', false);
        $this->postJson('/api/labels/types', ['name' => 'x'])->assertUnprocessable();
        $this->postJson('/api/labels/types', ['name' => 'x', 'heading' => 'X', 'storage' => 'warm'])->assertUnprocessable();

        // The item's sticker takes the brand's name.
        $item = $this->makeItem(false, 0, ['name' => 'Lime Pickle', 'label_enabled' => true, 'label_storage' => 'ambient', 'label_type_id' => $type['id']]);
        $this->getJson("/api/labels/items/{$item->id}")->assertOk()->assertJsonPath('data.defaults.brand', 'Amma')->assertJsonPath('data.defaults.how_to_use', 'Serve with rice. Keep the lid closed.');

        // A type in use cannot go; empty it first.
        $this->deleteJson("/api/labels/types/{$type['id']}")->assertUnprocessable();
        $item->forceFill(['label_type_id' => null])->save();
        $this->deleteJson("/api/labels/types/{$type['id']}")->assertOk();

        // Brands: a PNG logo is kept as uploaded; the main brand stays.
        $png = UploadedFile::fake()->createWithContent('amma.png', (string) file_get_contents(public_path('brand/logo-mark.png')));
        $this->post("/api/labels/brands/{$amma->id}/logo", ['file' => $png], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('data.name', 'Amma');
        $this->assertNotNull($amma->refresh()->logo_media_id);
        $this->assertSame('image/png', $amma->logo->mime_type);
        $jpg = UploadedFile::fake()->createWithContent('x.jpg', "\xFF\xD8\xFF\xE0 not a png");
        $this->post("/api/labels/brands/{$amma->id}/logo", ['file' => $jpg], ['Accept' => 'application/json'])->assertUnprocessable();
        $new = $this->postJson('/api/labels/brands', ['name' => 'Dhonveli', 'tagline' => 'From the island'])->assertCreated()->json('data');
        $this->deleteJson("/api/labels/brands/{$new['id']}")->assertOk();
        $main = LabelBrand::default();
        $this->deleteJson("/api/labels/brands/{$main->id}")->assertUnprocessable();

        Sanctum::actingAs($this->makeManager(), ['staff']);
        $this->getJson('/api/labels/types')->assertForbidden();
        $this->postJson('/api/labels/types', ['name' => 'x', 'heading' => 'X'])->assertForbidden();
    }
}
