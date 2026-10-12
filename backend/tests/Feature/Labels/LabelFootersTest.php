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
 * A footer is a preset to pick by name and change in place; blank lines
 * follow the brand and Business Details.
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

    public function test_the_standard_footer_and_one_per_brand_are_seeded_and_say_what_their_blank_lines_print(): void
    {
        $manager = $this->makeManager();
        Sanctum::actingAs($manager, ['staff']);
        $this->getJson('/api/labels/footers')->assertForbidden();
        $manager->grantPermission('labels.print');
        Sanctum::actingAs($manager->fresh(), ['staff']);
        $rows = collect($this->getJson('/api/labels/footers')->assertOk()->json('data'));

        $standard = $rows->firstWhere('is_default', true);
        $this->assertSame('Standard', $standard['name']);
        $this->assertNull($standard['brand_id']);
        $this->assertNull($standard['tagline'], 'blank: it follows the business');
        $this->assertSame('Bake & Grill', $standard['effective']['name']);
        $this->assertSame('Fresh Baked, Fire Grilled', $standard['effective']['tagline']);
        $this->assertSame('+960 912 0011', $standard['effective']['phone']);
        $this->assertSame('bakeandgrill.mv', $standard['effective']['website']);
        $this->assertSame('Kalaafaanu Hingun, Malé', $standard['effective']['address']);
        $this->assertSame('', $standard['effective']['by']);
        $this->assertTrue($standard['show_qr']);

        $amma = $rows->firstWhere('name', 'Amma');
        $this->assertSame(LabelBrand::query()->where('name', 'Amma')->value('id'), $amma['brand_id']);
        $this->assertSame('Amma', $amma['effective']['name']);
        $this->assertSame('Home-made, the Amma way', $amma['effective']['tagline']);
        $this->assertSame('by Bake & Grill', $amma['effective']['by']);

        // Writing needs Manage label settings.
        $this->postJson('/api/labels/footers', ['name' => 'Kitchen stamp'])->assertForbidden();
    }

    public function test_a_footer_is_made_changed_and_removed_and_the_standard_one_stays(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $made = $this->postJson('/api/labels/footers', [
            'name' => 'Kitchen stamp', 'tagline' => 'Hand-made daily', 'website' => 'amma.mv', 'show_qr' => false, 'by_line' => '',
        ])->assertCreated()
            ->assertJsonPath('data.name', 'Kitchen stamp')
            ->assertJsonPath('data.tagline', 'Hand-made daily')
            ->assertJsonPath('data.effective.tagline', 'Hand-made daily')
            ->assertJsonPath('data.effective.website', 'amma.mv')
            ->assertJsonPath('data.effective.phone', '+960 912 0011', 'a blank line keeps the business value')
            ->assertJsonPath('data.show_qr', false)
            ->assertJsonPath('data.by_line', null);
        $id = $made->json('data.id');

        $this->putJson("/api/labels/footers/{$id}", ['phone' => '+960 777 1234', 'show_by' => false])->assertOk()
            ->assertJsonPath('data.effective.phone', '+960 777 1234')
            ->assertJsonPath('data.show_by', false);
        $this->putJson("/api/labels/footers/{$id}", ['name' => ''])->assertStatus(422);
        // A footer for the main brand is a footer for the business: no brand kept.
        $main = LabelBrand::query()->where('is_default', true)->value('id');
        $this->putJson("/api/labels/footers/{$id}", ['brand_id' => $main])->assertOk()->assertJsonPath('data.brand_id', null);

        $standard = LabelFooter::default();
        $this->deleteJson("/api/labels/footers/{$standard->id}")->assertStatus(422);
        // A label that printed it goes back to its brand's footer once it is gone.
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
}
