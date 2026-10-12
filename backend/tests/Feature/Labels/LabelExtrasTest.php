<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\Barcode;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\CustomLabel;
use App\Models\Item;
use App\Models\LabelBrand;
use App\Models\LabelJob;
use App\Models\LabelPrint;
use App\Models\LabelType;
use App\Models\SiteSetting;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Labels, 2026-10-12 (owner: "build all" of the audit's recommendations):
 * price and barcode, net weight, allergens in bold, both languages on one
 * sticker, a draft custom label previewed before it is saved, and pinned
 * saved labels.
 */
class LabelExtrasTest extends TestCase
{
    use RefreshDatabase;

    private Item $bajiya;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        CarbonImmutable::setTestNow('2026-10-12 09:00:00');
        SiteSetting::set('business_phone', '+960 912 0011');
        Cache::flush();
        $this->bajiya = $this->makeItem(false, 0, [
            'name' => 'Bajiya', 'name_dv' => 'ބާޖިޔާ', 'base_price' => 3.5, 'label_enabled' => true, 'label_shelf_life_days' => 90,
            'label_ingredients_source' => 'manual',
            'label_ingredients' => 'Flour, salt, oil, egg, onion, smoked tuna',
            'label_ingredients_dv' => 'ފުށް، ލޮނު، ތެޔޮ، ބިސް، ފިޔާ، ވަޅޯމަސް',
            'allergens' => ['egg', 'tree-nuts'],
        ]);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    private function sheet(array $body): string
    {
        $res = $this->postJson('/api/labels/stickers/url', $body)->assertOk();

        return (string) $this->get($res->json('view_url'))->assertOk()->getContent();
    }

    public function test_the_price_prints_only_when_switched_on_the_menu_price_unless_one_is_typed(): void
    {
        $html = $this->sheet(['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-4']);
        // "MVR " with its space: the sheet carries the branded QR as base64, which can spell MVR by chance.
        $this->assertStringNotContainsString('MVR ', $html, 'off by default');

        $this->putJson("/api/items/{$this->bajiya->id}/label", ['label_show_price' => true])->assertOk()
            ->assertJsonPath('data.label_show_price', true)
            ->assertJsonPath('data.menu_price', 3.5);
        $html = $this->sheet(['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-4']);
        $this->assertStringContainsString('MVR 3.50', $html);

        $this->putJson("/api/items/{$this->bajiya->id}/label", ['label_price' => 4])->assertOk()->assertJsonPath('data.label_price', 4);
        $html = $this->sheet(['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-12']);
        $this->assertStringContainsString('MVR 4.00', $html, 'the compact sticker carries it on the quantity line');
    }

    public function test_a_barcode_and_a_net_weight_print_and_a_bad_barcode_is_refused(): void
    {
        $this->putJson("/api/items/{$this->bajiya->id}/label", ['label_barcode' => '12345'])->assertUnprocessable()
            ->assertJsonPath('errors.label_barcode.0', 'A barcode is 12 or 13 digits (EAN-13), or 7 or 8 (EAN-8).');
        $this->putJson("/api/items/{$this->bajiya->id}/label", ['label_barcode' => '590123412345', 'label_net_weight' => '250 g'])->assertOk()
            ->assertJsonPath('data.label_barcode', '590123412345')
            ->assertJsonPath('data.label_net_weight', '250 g');

        // The full sticker carries the bars (beside the QRs and the allergen symbols) and the digits with the check digit added.
        $html = $this->sheet(['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-4', 'qty' => 10]);
        $this->assertStringContainsString(Barcode::svgDataUri(Barcode::normalise('590123412345'), 30, 12), $html, 'the bars');
        $this->assertStringContainsString('5 901234 123457', $html);
        $this->assertStringContainsString('NET 250 g', $html);
        // A compact label has no room for the bars; the net weight still rides on the quantity.
        $html = $this->sheet(['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-12', 'qty' => 10]);
        $this->assertSame(1, substr_count($html, 'data:image/svg+xml;base64,'), 'the QR only');
        $this->assertStringContainsString('QTY: 10 PCS · 250 g', $html);
    }

    public function test_allergens_print_bold_in_the_ingredients_and_as_a_contains_note(): void
    {
        $this->getJson("/api/labels/items/{$this->bajiya->id}")->assertOk()->assertJsonPath('data.allergens', ['egg', 'tree nuts']);
        $html = $this->sheet(['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-4']);
        $this->assertStringContainsString('<span class="f-j7">egg</span>', $html, 'the allergen word in bold inside the list');
        $this->assertStringContainsString('Contains egg, tree nuts', $html, 'a note when the item has none of its own');

        // The item's own note wins over the automatic one.
        $this->putJson("/api/items/{$this->bajiya->id}/label", ['label_note' => 'Made in a kitchen that handles nuts'])->assertOk();
        $html = $this->sheet(['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-4']);
        $this->assertStringContainsString('Made in a kitchen that handles nuts', $html);
        $this->assertStringNotContainsString('Contains egg', $html);

        // A custom label types its allergens.
        $id = $this->postJson('/api/labels/custom', ['name' => 'Peanut Sauce', 'label_ingredients' => 'Peanuts, oil, chilli', 'label_allergens' => 'peanuts, soy'])->assertCreated()
            ->assertJsonPath('data.label_allergens', 'peanuts, soy')->json('data.id');
        $html = $this->sheet(['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'layout' => 'a4-4']);
        $this->assertStringContainsString('<span class="f-j7">Peanuts</span>', $html);
        $this->assertStringContainsString('Contains peanuts, soy', $html);
    }

    public function test_both_languages_print_on_one_sticker(): void
    {
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-4', 'lang' => 'both'])->assertOk();
        $html = (string) $this->get($res->json('view_url'))->assertOk()->getContent();
        $this->assertStringContainsString('Bajiya', $html);
        $this->assertStringContainsString('ބާޖިޔާ', $html, 'the Dhivehi name under the English one');
        $this->assertStringContainsString('ވަޅޯމަސް', $html, 'the Dhivehi ingredients under the English ones');
        $this->assertStringContainsString('KEEP FROZEN AT -18°C OR BELOW', $html);
        $this->assertStringContainsString('ފިނިކޮށް', $html, 'the Dhivehi storage line in the strip');
        $this->assertSame('sticker_both', LabelPrint::query()->sole()->kind);

        // The compact sticker too.
        $html = $this->sheet(['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-12', 'lang' => 'both']);
        $this->assertStringContainsString('ވަޅޯމަސް', $html);
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'lang' => 'fr'])->assertUnprocessable();
    }

    public function test_a_draft_custom_label_previews_before_it_is_saved_and_saves_nothing(): void
    {
        $draft = [
            'name' => 'Garlic Sauce', 'name_dv' => 'ލޮނުމެދު ސޯސް',
            'brand_id' => LabelBrand::query()->where('name', 'Amma')->value('id'),
            'label_type_id' => LabelType::query()->where('name', 'Chilled Hedhika')->value('id'),
            'label_ingredients' => 'Garlic, oil, lemon, salt', 'label_price' => 25, 'label_pack_qty' => 250, 'label_pack_unit' => 'ML',
            'layout' => 'single-custom', 'w' => 40, 'h' => 60,
        ];
        $res = $this->postJson('/api/labels/custom/preview', $draft)->assertOk();
        $this->assertStringContainsString('items=d', urldecode($res->json('one_url')));
        $html = (string) $this->get($res->json('one_url'))->assertOk()->getContent();
        foreach (['Garlic Sauce', 'Garlic, oil, lemon, salt', 'MVR 25.00', 'A M M A'] as $text) {
            $this->assertStringContainsString($text, $html, $text);
        }
        $this->assertSame(0, CustomLabel::query()->count(), 'a preview saves no label');
        $this->assertSame(0, LabelPrint::query()->count(), 'and logs no print');
        $this->assertSame(0, LabelJob::query()->count());

        // A draft is a preview only: the print API does not take one, and an unknown token draws nothing.
        $this->postJson('/api/labels/stickers/url', ['items' => 'dabcdefabcdefabcd:1', 'layout' => 'a4-4'])->assertUnprocessable();

        // Writing a draft needs Manage label settings, like saving one.
        $printer = $this->makeManager();
        $printer->grantPermission('labels.print');
        Sanctum::actingAs($printer->fresh(), ['staff']);
        $this->postJson('/api/labels/custom/preview', $draft)->assertForbidden();
    }

    public function test_a_pinned_saved_label_leads_the_list(): void
    {
        $first = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 4]], 'layout' => 'a4-4'])->assertOk()->json('job');
        CarbonImmutable::setTestNow('2026-10-12 10:00:00');
        $second = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 8]], 'layout' => 'a4-4'])->assertOk()->json('job');
        $this->assertSame($second['id'], $this->getJson('/api/labels/jobs')->json('data.0.id'), 'newest printed first');

        $this->putJson("/api/labels/jobs/{$first['id']}", ['pinned' => true])->assertOk()->assertJsonPath('data.pinned', true);
        $list = $this->getJson('/api/labels/jobs')->json('data');
        $this->assertSame($first['id'], $list[0]['id'], 'pinned leads');
        $this->assertTrue($list[0]['pinned']);
        $this->assertCount(1, $this->getJson('/api/labels/jobs?pinned=1')->json('data'));

        $this->putJson("/api/labels/jobs/{$first['id']}", ['pinned' => false, 'name' => 'Morning run'])->assertOk()
            ->assertJsonPath('data.pinned', false)->assertJsonPath('data.name', 'Morning run');
    }
}
