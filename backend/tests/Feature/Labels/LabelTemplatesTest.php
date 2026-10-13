<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\LabelTemplates;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\LabelBrand;
use App\Models\LabelTemplate;
use App\Models\LabelType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Validator;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Label templates (round 7 of the usability work, owner, 2026-10-13: "Start
 * from a saved label or a built-in template, and Save as template from any
 * label, so a new sauce takes thirty seconds"): a label's settings without
 * the product, saved from any label, tidied on the way in, listed with the
 * built-in ones, and ready to start a new label from.
 */
class LabelTemplatesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    public function test_reading_needs_print_labels_and_writing_needs_manage_label_settings(): void
    {
        $manager = $this->makeManager();
        Sanctum::actingAs($manager, ['staff']);
        $this->getJson('/api/labels/templates')->assertForbidden();

        $manager->grantPermission('labels.print');
        Sanctum::actingAs($manager->fresh(), ['staff']);
        $this->getJson('/api/labels/templates')->assertOk()->assertJsonCount(0, 'data')->assertJsonCount(count(LabelTemplates::BUILTIN), 'builtin');
        $this->postJson('/api/labels/templates', ['name' => 'Sauces', 'fields' => ['label_storage' => 'chilled']])->assertForbidden();

        $manager->grantPermission('labels.manage');
        Sanctum::actingAs($manager->fresh(), ['staff']);
        $id = $this->postJson('/api/labels/templates', ['name' => 'Sauces', 'fields' => ['label_storage' => 'chilled']])->assertCreated()->json('data.id');
        $this->putJson("/api/labels/templates/{$id}", ['name' => 'Chilled sauces'])->assertOk()->assertJsonPath('data.name', 'Chilled sauces');
        $this->deleteJson("/api/labels/templates/{$id}")->assertOk();
        $this->assertSame(0, LabelTemplate::query()->count());
    }

    public function test_a_template_is_saved_tidied_listed_renamed_and_removed(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $amma = LabelBrand::query()->where('name', 'Amma')->value('id');
        $chilled = LabelType::query()->where('name', 'Chilled Hedhika')->value('id');

        $made = $this->postJson('/api/labels/templates', [
            'name' => '  Sauce in a jar ',
            'source' => 'Garlic Sauce',
            'fields' => [
                'brand_id' => $amma, 'label_type_id' => $chilled, 'label_heading' => '  HOMEMADE SAUCE ', 'label_note' => '',
                'label_shelf_life_days' => '14', 'label_pack_unit' => 'ML', 'label_show_qr' => false, 'label_lang' => 'both',
                'label_wrap' => ['parts' => ['qr', 'brand', 'dates', 'qr'], 'band' => false],
                // The product itself never goes into a template: dropped, with anything unknown.
                'name' => 'Garlic Sauce', 'label_barcode' => '590123412345', 'label_price' => 25, 'label_photo_media_id' => 1, 'colour' => 'red',
            ],
            'size' => ['shape' => 'rect', 'preset' => 'r60x40', 'on' => 'printer'],
        ])->assertCreated();
        $id = $made->json('data.id');
        $made->assertJsonPath('data.name', 'Sauce in a jar')
            ->assertJsonPath('data.builtin', false)
            ->assertJsonPath('data.source', 'Garlic Sauce')
            ->assertJsonPath('data.fields.label_heading', 'HOMEMADE SAUCE')
            ->assertJsonPath('data.fields.label_note', null)
            ->assertJsonPath('data.fields.label_shelf_life_days', 14)
            ->assertJsonPath('data.fields.label_show_qr', false)
            ->assertJsonPath('data.fields.label_lang', 'both')
            ->assertJsonPath('data.fields.label_wrap.parts', ['qr', 'brand', 'dates'])
            ->assertJsonPath('data.fields.label_wrap.band', false)
            ->assertJsonMissingPath('data.fields.name')
            ->assertJsonMissingPath('data.fields.label_barcode')
            ->assertJsonMissingPath('data.fields.label_price')
            ->assertJsonMissingPath('data.fields.label_photo_media_id')
            ->assertJsonMissingPath('data.fields.colour')
            ->assertJsonPath('data.type_name', 'Chilled Hedhika')
            ->assertJsonPath('data.brand_name', 'Amma')
            ->assertJsonPath('data.storage', 'chilled')
            ->assertJsonPath('data.size.preset', 'r60x40')
            ->assertJsonPath('data.size.on', 'printer');
        $this->assertEquals(['w' => 60.0, 'h' => 40.0], array_intersect_key($made->json('data.size'), array_flip(['w', 'h'])));

        // Listed by name, the built-in ones beside, each with a size that prints.
        $list = $this->getJson('/api/labels/templates')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $id);
        foreach ($list->json('builtin') as $b) {
            $this->assertTrue($b['builtin']);
            $this->assertNotNull($b['size'], $b['name']);
            $this->assertContains($b['storage'], ['frozen', 'chilled', 'ambient'], $b['name']);
        }
        $this->assertSame('Drink in a bottle', collect($list->json('builtin'))->firstWhere('id', 'drink-bottle')['name']);
        $this->assertSame(['brand', 'legal', 'nutrition', 'dates', 'barcode', 'qr', 'marks'], collect($list->json('builtin'))->firstWhere('id', 'drink-bottle')['fields']['label_wrap']['parts']);

        // Renamed, given a new size, then removed.
        $this->putJson("/api/labels/templates/{$id}", ['name' => 'Jar sauce', 'size' => ['shape' => 'circle', 'preset' => 'c60', 'on' => 'sheet']])->assertOk()
            ->assertJsonPath('data.name', 'Jar sauce')->assertJsonPath('data.size.shape', 'circle')->assertJsonPath('data.fields.label_heading', 'HOMEMADE SAUCE');
        $this->deleteJson("/api/labels/templates/{$id}")->assertOk();
        $this->getJson('/api/labels/templates')->assertOk()->assertJsonCount(0, 'data');

        // Refused: no name, a shelf life of 0, a type that does not exist. A size that cannot print is simply none.
        $this->postJson('/api/labels/templates', ['name' => ' ', 'fields' => []])->assertUnprocessable();
        $this->postJson('/api/labels/templates', ['name' => 'Odd', 'fields' => ['label_shelf_life_days' => 0]])->assertUnprocessable();
        $this->postJson('/api/labels/templates', ['name' => 'Odd', 'fields' => ['label_type_id' => 9999]])->assertUnprocessable();
        $this->postJson('/api/labels/templates', ['name' => 'Tiny', 'fields' => [], 'size' => ['shape' => 'rect', 'preset' => 'custom', 'on' => 'sheet', 'w' => 5, 'h' => 5]])->assertCreated()->assertJsonPath('data.size', null);
    }

    /** A type removed after the template was saved leaves the box blank rather than a dangling id. */
    public function test_a_removed_type_leaves_the_template_box_blank(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $type = LabelType::query()->create(['name' => 'Short-lived', 'heading' => 'SHORT', 'storage' => 'chilled']);
        $id = $this->postJson('/api/labels/templates', ['name' => 'From the type', 'fields' => ['label_type_id' => $type->id, 'label_heading' => 'X']])->assertCreated()->assertJsonPath('data.type_name', 'Short-lived')->json('data.id');
        $type->delete();
        $this->getJson('/api/labels/templates')->assertOk()->assertJsonPath('data.0.id', $id)->assertJsonPath('data.0.fields.label_type_id', null)->assertJsonPath('data.0.type_name', null)->assertJsonPath('data.0.fields.label_heading', 'X');
    }

    /** Every built-in template passes the same rules a saved one does, and a new custom label can be made from it and drawn. */
    public function test_the_built_in_templates_are_sound_and_start_a_label(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        foreach (LabelTemplates::BUILTIN as $b) {
            $this->assertTrue(Validator::make(['fields' => $b['fields']], LabelTemplates::rules())->passes(), $b['name']);
            $this->assertNotNull(LabelTemplates::normaliseSize($b['size']), $b['name']);
            $id = $this->postJson('/api/labels/custom', ['name' => "From {$b['name']}"] + LabelTemplates::normaliseFields($b['fields']))->assertCreated()->json('data.id');
            $size = LabelTemplates::normaliseSize($b['size']);
            $layout = $size['shape'] === 'circle' ? 'a4-round-custom' : ($size['preset'] === 'r105x148' ? 'a4-4' : 'a4-custom');
            $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'layout' => $layout, 'w' => $size['w'], 'h' => $size['h'], 'preview' => true])->assertOk();
            $this->assertStringContainsString("From {$b['name']}", (string) $this->get($res->json('view_url'))->assertOk()->getContent(), $b['name']);
        }
    }
}
