<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\LabelBrand;
use App\Models\LabelFooter;
use App\Models\LabelType;
use App\Models\SiteSetting;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-12: "No easy option to select and edit branding footer."
 * A footer is a preset to pick by name and change in place. And: "Footer
 * should be always branding of Bake and Grill. Amma is a food brand label
 * but the actual brand is under Bake and Grill": blank lines follow Business
 * Details whatever brand is on the header, and a footer has no brand.
 */
class LabelFootersTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        CarbonImmutable::setTestNow('2026-10-12 09:00:00');
        SiteSetting::set('business_phone', '+960 912 0011');
        SiteSetting::set('business_website', 'bakeandgrill.mv');
        SiteSetting::set('business_address_line1', 'Kalaafaanu Hingun');
        SiteSetting::set('business_address_city', 'Malé');
        \Illuminate\Support\Facades\Cache::flush();
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_only_the_standard_footer_is_seeded_and_it_says_what_its_blank_lines_print(): void
    {
        $manager = $this->makeManager();
        Sanctum::actingAs($manager, ['staff']);
        $this->getJson('/api/labels/footers')->assertForbidden();
        $manager->grantPermission('labels.print');
        Sanctum::actingAs($manager->fresh(), ['staff']);
        $rows = collect($this->getJson('/api/labels/footers')->assertOk()->json('data'));

        // One footer per food brand was seeded once; a footer is the business's now.
        $this->assertCount(1, $rows);
        $standard = $rows->firstWhere('is_default', true);
        $this->assertSame('Standard', $standard['name']);
        $this->assertArrayNotHasKey('brand_id', $standard);
        $this->assertArrayNotHasKey('by_line', $standard);
        $this->assertArrayNotHasKey('by', $standard['effective']);
        $this->assertNull($standard['tagline'], 'blank: it follows the business');
        $this->assertSame('Bake & Grill', $standard['effective']['name']);
        $this->assertSame('Fresh Baked, Fire Grilled', $standard['effective']['tagline']);
        $this->assertSame('+960 912 0011', $standard['effective']['phone']);
        $this->assertSame('bakeandgrill.mv', $standard['effective']['website']);
        $this->assertSame('Kalaafaanu Hingun, Malé', $standard['effective']['address']);
        $this->assertTrue($standard['show_qr']);

        // Writing needs Manage label settings.
        $this->postJson('/api/labels/footers', ['name' => 'Kitchen stamp'])->assertForbidden();
    }

    public function test_a_footer_is_made_changed_and_removed_and_the_standard_one_stays(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $amma = LabelBrand::query()->where('name', 'Amma')->value('id');
        $made = $this->postJson('/api/labels/footers', [
            'name' => 'Kitchen stamp', 'tagline' => 'Hand-made daily', 'website' => 'amma.mv', 'show_qr' => false, 'brand_id' => $amma,
        ])->assertCreated()
            ->assertJsonPath('data.name', 'Kitchen stamp')
            ->assertJsonPath('data.tagline', 'Hand-made daily')
            ->assertJsonPath('data.effective.name', 'Bake & Grill', 'the business, whatever brand was sent')
            ->assertJsonPath('data.effective.tagline', 'Hand-made daily')
            ->assertJsonPath('data.effective.website', 'amma.mv')
            ->assertJsonPath('data.effective.phone', '+960 912 0011', 'a blank line keeps the business value')
            ->assertJsonPath('data.show_qr', false)
            ->assertJsonMissingPath('data.brand_id');
        $id = $made->json('data.id');

        $this->putJson("/api/labels/footers/{$id}", ['phone' => '+960 777 1234', 'tagline' => ''])->assertOk()
            ->assertJsonPath('data.effective.phone', '+960 777 1234')
            ->assertJsonPath('data.tagline', null)
            ->assertJsonPath('data.effective.tagline', 'Fresh Baked, Fire Grilled');
        $this->putJson("/api/labels/footers/{$id}", ['name' => ''])->assertStatus(422);

        $standard = LabelFooter::default();
        $this->deleteJson("/api/labels/footers/{$standard->id}")->assertStatus(422);
        // A label that printed it prints the standard footer once it is gone.
        $label = $this->postJson('/api/labels/custom', ['name' => 'Garlic Sauce', 'footer_id' => $id])->assertCreated()->json('data.id');
        $this->deleteJson("/api/labels/footers/{$id}")->assertOk();
        $this->assertNull(collect($this->getJson('/api/labels/custom')->json('data'))->firstWhere('id', $label)['footer_id']);
    }

    public function test_a_custom_label_a_label_type_and_a_whole_sheet_pick_their_footer(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $type = LabelType::query()->where('name', 'Chilled Hedhika')->first();
        $stamp = $this->postJson('/api/labels/footers', ['name' => 'Kitchen stamp', 'tagline' => 'Hand-made daily', 'website' => 'amma.mv'])->assertCreated()->json('data.id');
        $standard = LabelFooter::default()->id;
        $sheet = fn (array $items, array $extra = []) => (string) $this->get($this->postJson('/api/labels/stickers/url', ['items' => $items, 'preview' => true, 'layout' => 'a4-4'] + $extra)->assertOk()->json('view_url'))->assertOk()->getContent();

        // A custom label's own choice.
        $custom = $this->postJson('/api/labels/custom', ['name' => 'Garlic Sauce', 'label_type_id' => $type->id, 'footer_id' => $stamp])->assertCreated()->json('data.id');
        $html = $sheet([['id' => $custom, 'kind' => 'custom', 'copies' => 1]]);
        $this->assertStringContainsString('Hand-made daily', $html);
        $this->assertStringContainsString('amma.mv', $html);
        $this->assertStringNotContainsString('bakeandgrill.mv', $html);

        // A type's default footer reaches the menu items printed with it.
        $item = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true, 'label_type_id' => $type->id]);
        $this->assertStringNotContainsString('amma.mv', $sheet([['id' => $item->id, 'copies' => 1]]));
        $this->putJson("/api/labels/types/{$type->id}", ['footer_id' => $stamp])->assertOk()->assertJsonPath('data.footer_id', $stamp);
        $this->assertStringContainsString('amma.mv', $sheet([['id' => $item->id, 'copies' => 1]]));

        // One footer for the whole sheet wins over both, and a saved label keeps it.
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $item->id, 'copies' => 1], ['id' => $custom, 'kind' => 'custom', 'copies' => 1]], 'layout' => 'a4-4', 'footer' => $standard])->assertOk();
        $html = (string) $this->get($res->json('view_url'))->assertOk()->getContent();
        $this->assertStringNotContainsString('amma.mv', $html);
        $this->assertSame(2, substr_count($html, 'bakeandgrill.mv'));
        $this->assertSame($standard, $this->getJson('/api/labels/jobs/' . $res->json('job.id'))->assertOk()->json('data.request.footer'));
        $again = $this->postJson('/api/labels/jobs/' . $res->json('job.id') . '/print')->assertOk();
        $this->assertStringNotContainsString('amma.mv', (string) $this->get($again->json('view_url'))->getContent());

        // A footer that is not there is refused.
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $item->id, 'copies' => 1]], 'layout' => 'a4-4', 'footer' => 9999])->assertStatus(422);
    }

    /**
     * Owner, 2026-10-12: footers "in different styles". A footer picks its
     * look; every design draws it: the band's colour, no band, or the logo
     * in the name's place.
     */
    public function test_a_footer_prints_in_the_look_it_picked_on_every_size(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $amma = LabelBrand::query()->where('name', 'Amma')->value('id');
        $standard = LabelFooter::default();
        $this->assertSame('dark', collect($this->getJson('/api/labels/footers')->json('data'))->firstWhere('id', $standard->id)['style']);
        $this->putJson("/api/labels/footers/{$standard->id}", ['style' => 'neon'])->assertStatus(422);

        $custom = $this->postJson('/api/labels/custom', ['name' => 'Garlic Sauce', 'brand_id' => $amma])->assertCreated()->json('data.id');
        $sheet = fn (string $layout, array $size = []) => (string) $this->get($this->postJson('/api/labels/stickers/url', ['items' => [['id' => $custom, 'kind' => 'custom', 'copies' => 1]], 'preview' => true, 'layout' => $layout] + $size)->assertOk()->json('view_url'))->assertOk()->getContent();
        $band = fn (string $html, string $hex): int => substr_count($html, 'background:' . $hex . ';');
        $layouts = ['a4-4' => [], 'a4-12' => [], 'single-custom' => ['w' => 40, 'h' => 60]];

        // Dark: the dark band, the name in it. Other boxes share its colours
        // (the made-on date box is dark, the header band pale), so each look
        // is measured against this one.
        $dark = [];
        $pale = [];
        foreach ($layouts as $layout => $size) {
            $html = $sheet($layout, $size);
            $dark[$layout] = $band($html, '#1C1408');
            $pale[$layout] = $band($html, '#FEF3E8');
            $this->assertGreaterThanOrEqual(1, $dark[$layout], "$layout dark band");
            $this->assertStringContainsString('Bake &amp; Grill', $html, "$layout name");
        }

        // Light: a pale band with a rust rule in the dark band's place.
        $this->putJson("/api/labels/footers/{$standard->id}", ['style' => 'light'])->assertOk()->assertJsonPath('data.style', 'light');
        foreach ($layouts as $layout => $size) {
            $html = $sheet($layout, $size);
            $this->assertSame($dark[$layout] - 1, $band($html, '#1C1408'), "$layout light: no dark band");
            $this->assertSame($pale[$layout] + 1, $band($html, '#FEF3E8'), "$layout light: a pale band");
            $this->assertStringContainsString('Bake &amp; Grill', $html, "$layout keeps the name");
        }

        // Rust: the band in the brand rust (the storage strip is rust too).
        $this->putJson("/api/labels/footers/{$standard->id}", ['style' => 'rust'])->assertOk();
        $full = $sheet('a4-4');
        $this->assertSame($dark['a4-4'] - 1, $band($full, '#1C1408'));
        $this->assertGreaterThanOrEqual(2, $band($full, '#B74B0C'));

        // Plain: no band at all, a rule where it was.
        $this->putJson("/api/labels/footers/{$standard->id}", ['style' => 'plain'])->assertOk();
        foreach ($layouts as $layout => $size) {
            $html = $sheet($layout, $size);
            $this->assertSame($dark[$layout] - 1, $band($html, '#1C1408'), "$layout plain: no dark band");
            $this->assertSame($pale[$layout], $band($html, '#FEF3E8'), "$layout plain: no pale band either");
            $this->assertStringContainsString('Bake &amp; Grill', $html, "$layout keeps the name");
        }

        // Logo: the dark band with the whole logo where the name was, on the full, compact and small designs.
        $this->putJson("/api/labels/footers/{$standard->id}", ['style' => 'logo'])->assertOk();
        foreach ($layouts as $layout => $size) {
            $html = $sheet($layout, $size);
            $this->assertSame($dark[$layout], $band($html, '#1C1408'), "$layout logo: the dark band");
            $this->assertStringNotContainsString('Bake &amp; Grill', $html, "$layout: the logo stands for the name");
            $this->assertStringContainsString('+960 912 0011', $html, "$layout keeps the phone");
        }
        // The round sticker has no band: it keeps its footer line.
        $this->assertStringContainsString('Bake &amp; Grill', $sheet('single-round-custom', ['w' => 60]));
    }

    /**
     * Owner, 2026-10-12: "Footer should be always branding of Bake and Grill."
     * With nothing picked the standard footer prints, words typed into it
     * included, under any food brand's header; the QR then follows the type.
     */
    public function test_nothing_picked_prints_the_standard_footer_under_any_brand_with_the_types_qr_choice(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $amma = LabelBrand::query()->where('name', 'Amma')->value('id');
        $type = LabelType::query()->where('name', 'Chilled Hedhika')->first();
        $standard = LabelFooter::default();
        $sheet = fn (array $items, array $extra = []) => (string) $this->get($this->postJson('/api/labels/stickers/url', ['items' => $items, 'preview' => true, 'layout' => 'a4-4'] + $extra)->assertOk()->json('view_url'))->assertOk()->getContent();

        $custom = $this->postJson('/api/labels/custom', ['name' => 'Garlic Sauce', 'brand_id' => $amma, 'label_type_id' => $type->id])->assertCreated()->json('data.id');
        $html = $sheet([['id' => $custom, 'kind' => 'custom', 'copies' => 1]]);
        $this->assertStringContainsString('A M M A', $html, 'the food brand on the header');
        $this->assertStringContainsString('Fresh Baked, Fire Grilled', $html, 'the business in the footer');
        $this->assertStringNotContainsString('Home-made, the Amma way', $html);
        $this->assertStringNotContainsString('by Bake &amp; Grill', $html);
        $this->assertStringContainsString('style="left:87mm', $html, 'the complaints QR at the footer\'s right');

        // Words typed into the standard footer print without picking it anywhere.
        $this->putJson("/api/labels/footers/{$standard->id}", ['tagline' => 'Hand-made in Malé'])->assertOk()->assertJsonPath('data.effective.tagline', 'Hand-made in Malé');
        $html = $sheet([['id' => $custom, 'kind' => 'custom', 'copies' => 1]]);
        $this->assertStringContainsString('Hand-made in Malé', $html);
        $this->assertStringNotContainsString('Fresh Baked, Fire Grilled', $html);

        // The type's own QR switch still decides when no footer was picked.
        $this->putJson("/api/labels/types/{$type->id}", ['show_qr' => false])->assertOk();
        $this->assertStringNotContainsString('style="left:87mm', $sheet([['id' => $custom, 'kind' => 'custom', 'copies' => 1]]));
        // A picked footer's switch wins over the type's.
        $this->putJson("/api/labels/custom/{$custom}", ['footer_id' => $standard->id])->assertOk();
        $this->assertStringContainsString('style="left:87mm', $sheet([['id' => $custom, 'kind' => 'custom', 'copies' => 1]]));
    }
}
