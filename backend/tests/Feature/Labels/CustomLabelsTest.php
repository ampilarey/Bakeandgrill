<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\StickerSheet;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\CustomLabel;
use App\Models\LabelBrand;
use App\Models\LabelJob;
use App\Models\LabelPrint;
use App\Models\LabelType;
use App\Models\Media;
use App\Models\SiteSetting;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-11: "Add option to add custom labels using different brands
 * logos and other details. Not only from the menu list."
 */
class CustomLabelsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        CarbonImmutable::setTestNow('2026-10-04 09:00:00');
        SiteSetting::set('business_phone', '+960 912 0011');
        SiteSetting::set('business_website', 'bakeandgrill.mv');
        \Illuminate\Support\Facades\Cache::flush();
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    /** @return array<string, mixed> */
    private function sauce(): array
    {
        return [
            'name' => 'Garlic Sauce',
            'name_dv' => 'ލޮނުމެދު ސޯސް',
            'brand_id' => LabelBrand::query()->where('name', 'Amma')->value('id'),
            'label_type_id' => LabelType::query()->where('name', 'Chilled Hedhika')->value('id'),
            'label_heading' => 'HOMEMADE SAUCE',
            'label_ingredients' => 'Garlic, oil, lemon, salt',
            'label_note' => 'Contains no nuts',
            'label_shelf_life_days' => 14,
            'label_pack_qty' => 250,
            'label_pack_unit' => 'ML',
        ];
    }

    public function test_reading_needs_print_labels_and_writing_needs_manage_label_settings(): void
    {
        $manager = $this->makeManager();
        Sanctum::actingAs($manager, ['staff']);
        $this->getJson('/api/labels/custom')->assertForbidden();

        $manager->grantPermission('labels.print');
        Sanctum::actingAs($manager->fresh(), ['staff']);
        $this->getJson('/api/labels/custom')->assertOk()->assertJsonCount(0, 'data');
        $this->postJson('/api/labels/custom', ['name' => 'Gift box'])->assertForbidden();

        $manager->grantPermission('labels.manage');
        Sanctum::actingAs($manager->fresh(), ['staff']);
        $id = $this->postJson('/api/labels/custom', ['name' => 'Gift box'])->assertCreated()->json('data.id');
        $this->putJson("/api/labels/custom/{$id}", ['name' => 'Gift box, large'])->assertOk()->assertJsonPath('data.name', 'Gift box, large');
        $this->postJson('/api/labels/custom', ['name' => '  '])->assertUnprocessable();
    }

    public function test_a_custom_label_prints_with_its_own_brand_wording_and_details(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $made = $this->postJson('/api/labels/custom', $this->sauce())->assertCreated()
            ->assertJsonPath('data.kind', 'custom')
            ->assertJsonPath('data.brand_name', 'Amma')
            ->assertJsonPath('data.storage', 'chilled')
            ->assertJsonPath('data.label_type_name', 'Chilled Hedhika')
            ->assertJsonPath('data.ingredients.from', 'manual');
        $id = $made->json('data.id');

        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 4]], 'layout' => 'a4-4', 'fill' => true])->assertOk()
            ->assertJsonPath('summary.products.0.kind', 'custom')
            ->assertJsonPath('summary.products.0.key', "c{$id}")
            ->assertJsonPath('summary.products.0.name', 'Garlic Sauce')
            ->assertJsonPath('summary.products.0.exp', '2026-10-18');
        $html = (string) $this->get($res->json('view_url'))->assertOk()->getContent();
        foreach (['Garlic Sauce', 'Garlic, oil, lemon, salt', 'Contains no nuts', 'A M M A', 'HOMEMADE', 'QTY: 250 ML', 'Home-made, the Amma way', 'BEST BEFORE'] as $text) {
            $this->assertStringContainsString($text, $html, $text);
        }
        $this->assertSame(4, substr_count($html, 'data-testid="sticker"'));

        $log = LabelPrint::query()->sole();
        $this->assertSame($id, $log->custom_label_id);
        $this->assertNull($log->item_id);
        $this->assertSame('Garlic Sauce', $this->getJson('/api/labels/prints')->json('data.0.item'));

        // On a small label and in Dhivehi too.
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'layout' => 'single-custom', 'w' => 40, 'h' => 60, 'lang' => 'dv', 'preview' => true])->assertOk();
        $this->assertStringContainsString('ލޮނުމެދު ސޯސް', (string) $this->get($res->json('view_url'))->getContent());
    }

    public function test_menu_items_and_custom_labels_share_a_sheet_and_never_mix_up_their_ids(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $item = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true]);
        $id = $this->postJson('/api/labels/custom', $this->sauce())->json('data.id');

        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $item->id, 'copies' => 2], ['id' => $id, 'kind' => 'custom', 'copies' => 2]], 'layout' => 'a4-4'])->assertOk()
            ->assertJsonPath('summary.stickers', 4);
        $this->assertSame(['item', 'custom'], array_column($res->json('summary.products'), 'kind'));
        $html = (string) $this->get($res->json('view_url'))->getContent();
        $this->assertStringContainsString('Bajiya', $html);
        $this->assertStringContainsString('Garlic Sauce', $html);

        // "7:2" is menu item 7, "c7:3" custom label 7: two products.
        $this->assertSame([['id' => 7, 'copies' => 2, 'kind' => 'item'], ['id' => 7, 'copies' => 3, 'kind' => 'custom']], StickerSheet::parseItems('7:2,c7:3'));
        $this->assertSame('7:2,c7:3', StickerSheet::itemsParam(StickerSheet::parseItems('7:2,c7:3')));

        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => 99999, 'kind' => 'custom', 'copies' => 1]]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['items.0.id' => 'That product is no longer there. Pick it again.']);
    }

    public function test_a_custom_label_is_copied_and_removed_and_its_saved_label_says_so(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $id = $this->postJson('/api/labels/custom', $this->sauce())->json('data.id');
        $copy = $this->postJson("/api/labels/custom/{$id}/duplicate")->assertCreated();
        $this->assertSame('Garlic Sauce (copy)', $copy->json('data.name'));
        $this->assertSame('Contains no nuts', $copy->json('data.label_note'));

        // Printing saves the label with its request; it prints again while the product is there.
        $job = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 4]], 'layout' => 'single-custom', 'w' => 40, 'h' => 60])->assertOk()->json('job.id');
        $this->assertSame('custom', LabelJob::query()->findOrFail($job)->request['items'][0]['kind']);
        $this->postJson("/api/labels/jobs/{$job}/print")->assertOk();

        $this->deleteJson("/api/labels/custom/{$id}")->assertOk();
        $this->assertNull(CustomLabel::query()->find($id));
        $this->postJson("/api/labels/jobs/{$job}/print")->assertUnprocessable()
            ->assertJsonPath('message', 'Nothing to print: the products on this label have been removed. Pick them again.');
        // The prints already made stay in the log.
        $this->assertSame(2, LabelPrint::query()->count());
    }

    public function test_a_picture_is_kept_as_the_png_uploaded(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $id = $this->postJson('/api/labels/custom', ['name' => 'Gift box'])->json('data.id');

        $img = imagecreatetruecolor(40, 30);
        imagesavealpha($img, true);
        imagefill($img, 0, 0, imagecolorallocatealpha($img, 0, 0, 0, 127));
        ob_start();
        imagepng($img);
        $png = (string) ob_get_clean();

        $this->post("/api/labels/custom/{$id}/picture", ['file' => UploadedFile::fake()->createWithContent('box.png', $png)], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('data.label_photo_media_id', fn ($v) => is_int($v));
        $this->post("/api/labels/custom/{$id}/picture", ['file' => UploadedFile::fake()->createWithContent('name.png', $png), 'slot' => 'title'], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('data.label_title_media_id', fn ($v) => is_int($v));
        $media = Media::query()->findOrFail(CustomLabel::query()->findOrFail($id)->label_photo_media_id);
        $this->assertSame('image/png', $media->mime_type);
        $this->assertSame($png, Storage::disk('public')->get($media->path), 'stored byte for byte');

        $this->post("/api/labels/custom/{$id}/picture", ['file' => UploadedFile::fake()->createWithContent('photo.jpg', "\xFF\xD8\xFF\xE0 not a png")], ['Accept' => 'application/json'])
            ->assertUnprocessable();
    }
}
