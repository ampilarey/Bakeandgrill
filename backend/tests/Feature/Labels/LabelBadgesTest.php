<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\LabelBadges;
use App\Domains\Labels\LabelRaster;
use App\Domains\Labels\StickerSheet;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\SiteSetting;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Badges (round 9 of the usability work, owner, 2026-10-13: "badges you drop
 * on: Halal, Spicy, New, Gluten-free, drawn in the brand style"): a fixed
 * catalogue, up to four per product, drawn as rust pills under the name on
 * every size with the room, in the sticker's language.
 */
class LabelBadgesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        CarbonImmutable::setTestNow('2026-10-13 09:00:00');
        SiteSetting::set('business_phone', '+960 912 0011');
        SiteSetting::set('business_website', 'bakeandgrill.mv');
        Cache::flush();
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_the_catalogue_is_listed_and_a_list_is_tidied(): void
    {
        $this->getJson('/api/labels/layouts')->assertOk()->assertJsonPath('badges.0.key', 'halal')->assertJsonPath('badges.0.word', 'HALAL')->assertJsonPath('badges.0.label', 'Halal')->assertJsonCount(count(LabelBadges::CATALOGUE), 'badges');
        $this->assertSame(['spicy', 'halal', 'new', 'vegan'], LabelBadges::clean(['spicy', 'halal', 'bogus', 'spicy', ' new ', 'vegan', 'homemade']));
        $this->assertSame(['halal'], LabelBadges::clean('halal,nope'));
        $this->assertSame([], LabelBadges::clean(null));
    }

    public function test_a_product_keeps_its_badges_and_every_design_prints_them(): void
    {
        // A repeat is tidied away; an unknown badge or more than four is refused.
        $id = $this->postJson('/api/labels/custom', ['name' => 'Garlic Sauce', 'label_ingredients' => 'Garlic, oil', 'label_shelf_life_days' => 14, 'label_badges' => ['halal', 'spicy', 'halal']])
            ->assertCreated()->assertJsonPath('data.label_badges', ['halal', 'spicy'])->json('data.id');
        $this->postJson('/api/labels/custom', ['name' => 'Odd', 'label_badges' => ['nope']])->assertUnprocessable();
        $this->postJson('/api/labels/custom', ['name' => 'Odd', 'label_badges' => ['halal', 'spicy', 'new', 'vegan', 'homemade']])->assertUnprocessable();

        $sizes = [
            'full' => ['layout' => 'a4-4', 'w' => null, 'h' => null],
            'mini' => ['layout' => 'a4-custom', 'w' => 99, 'h' => 70.5],
            'small' => ['layout' => 'a4-custom', 'w' => 60, 'h' => 40],
            'small-wide' => ['layout' => 'a4-custom', 'w' => 70, 'h' => 30],
            'round' => ['layout' => 'a4-round-custom', 'w' => 60, 'h' => null],
            'wrap' => ['layout' => 'a4-custom', 'w' => 180, 'h' => 40],
        ];
        foreach ($sizes as $design => $size) {
            $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'preview' => true] + $size)->assertOk();
            $html = (string) $this->get($res->json('view_url'))->assertOk()->getContent();
            $this->assertStringContainsString('HALAL', $html, "$design prints the badge");
            $this->assertStringContainsString('SPICY', $html, "$design prints the badge");
            if ($design !== 'wrap') {
                $this->assertContains('badges', array_column($res->json('summary.spots'), 'key'), "$design marks the badges");
            }
            // In Dhivehi the Dhivehi word prints.
            $dv = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'preview' => true, 'lang' => 'dv'] + $size)->assertOk();
            $this->assertStringContainsString('ހަލާލް', (string) $this->get($dv->json('view_url'))->getContent(), "$design prints the Dhivehi badge");
        }
        $this->get($this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'layout' => 'a4-4', 'preview' => true])->json('pdf_url'))->assertOk();

        // The thermal rasteriser draws the pills as rectangles and text.
        $req = StickerSheet::normalise(['items' => "c{$id}:1", 'layout' => 'single-custom', 'w' => 60, 'h' => 40, 'fill' => true]);
        $this->assertSame(480, LabelRaster::page(app(StickerSheet::class)->build($req), 0, 203)['w']);

        // Taken off again: none.
        $this->putJson("/api/labels/custom/{$id}", ['label_badges' => []])->assertOk()->assertJsonPath('data.label_badges', []);
        $this->putJson("/api/labels/custom/{$id}", ['label_badges' => null])->assertOk()->assertJsonPath('data.label_badges', []);
    }

    public function test_a_menu_item_and_a_template_carry_badges(): void
    {
        $item = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true]);
        $this->putJson("/api/items/{$item->id}/label", ['label_badges' => ['new', 'spicy']])->assertOk()->assertJsonPath('data.label_badges', ['new', 'spicy']);
        $html = (string) $this->get($this->postJson('/api/labels/stickers/url', ['items' => [['id' => $item->id, 'copies' => 1]], 'layout' => 'a4-4', 'preview' => true])->json('view_url'))->getContent();
        $this->assertStringContainsString('NEW', $html);
        $this->assertStringContainsString('SPICY', $html);

        $this->postJson('/api/labels/templates', ['name' => 'Spicy things', 'fields' => ['label_badges' => ['spicy', 'halal', 'spicy']]])->assertCreated()->assertJsonPath('data.fields.label_badges', ['spicy', 'halal']);
        $this->postJson('/api/labels/templates', ['name' => 'Odd', 'fields' => ['label_badges' => ['nope']]])->assertUnprocessable();
    }
}
