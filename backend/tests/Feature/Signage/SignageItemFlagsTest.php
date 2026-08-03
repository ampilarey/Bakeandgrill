<?php

declare(strict_types=1);

namespace Tests\Feature\Signage;

use App\Models\Category;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Models\MenuGroup;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SignageItemFlagsTest extends TestCase
{
    use RefreshDatabase;

    private function makeSignageItem(array $attrs = []): Item
    {
        MenuGroup::firstOrCreate(
            ['id' => 1],
            ['name' => 'Default', 'slug' => 'default', 'sort_order' => 0, 'is_active' => true]
        );
        $cat = Category::firstOrCreate(['name' => 'Grill'], ['is_active' => true]);

        $item = Item::create(array_merge([
            'name' => 'Hot Plate',
            'base_price' => 50,
            'is_active' => true,
            'is_available' => true,
            'category_id' => $cat->id,
            'has_variants' => false,
            'menu_group_id' => 1,
        ], $attrs));

        foreach (['online_pickup', 'takeaway', 'dine_in', 'delivery'] as $ch) {
            ItemChannelAvailability::query()->updateOrCreate(
                ['item_id' => $item->id, 'channel' => $ch],
                ['is_enabled' => true],
            );
        }

        return $item;
    }

    public function test_items_table_has_the_signage_flag_columns(): void
    {
        $this->assertTrue(Schema::hasColumn('items', 'show_on_signage'));
        $this->assertTrue(Schema::hasColumn('items', 'is_signage_promoted'));
    }

    public function test_new_items_are_on_the_board_and_not_promoted_by_default(): void
    {
        $item = $this->makeSignageItem();

        $this->assertTrue($item->fresh()->show_on_signage);
        $this->assertFalse($item->fresh()->is_signage_promoted);
    }

    public function test_public_items_payload_exposes_the_signage_flags(): void
    {
        $item = $this->makeSignageItem();

        $res = $this->getJson('/api/items?available_only=1&channel=online_pickup');
        $res->assertOk();

        $row = collect($res->json('data'))->firstWhere('id', $item->id);
        $this->assertNotNull($row);
        $this->assertArrayHasKey('show_on_signage', $row);
        $this->assertArrayHasKey('is_signage_promoted', $row);
        $this->assertTrue($row['show_on_signage']);
        $this->assertFalse($row['is_signage_promoted']);
    }

    public function test_flags_round_trip_when_set(): void
    {
        $item = $this->makeSignageItem([
            'show_on_signage' => false,
            'is_signage_promoted' => true,
        ]);

        $res = $this->getJson('/api/items?available_only=1&channel=online_pickup');
        $res->assertOk();

        $row = collect($res->json('data'))->firstWhere('id', $item->id);
        $this->assertNotNull($row);
        $this->assertFalse($row['show_on_signage']);
        $this->assertTrue($row['is_signage_promoted']);
    }

    public function test_default_playlist_includes_the_auto_menu_entry(): void
    {
        $slides = \App\Domains\Signage\Services\SignageTemplateFactory::defaultPlaylistSlides();
        $origins = array_column($slides, 'template_origin');

        $this->assertContains('auto_menu', $origins);
    }

    public function test_auto_menu_template_carries_its_tuning_binding(): void
    {
        $slide = \App\Domains\Signage\Services\SignageTemplateFactory::template('auto_menu');
        $binding = $slide['elements'][0]['binding'] ?? [];

        $this->assertSame(12, $binding['showcase_cap']);
        $this->assertSame(14, $binding['rows_per_slide']);
        $this->assertArrayHasKey('showcase_seconds', $binding);
        $this->assertArrayHasKey('category_seconds', $binding);
    }

    public function test_template_catalog_offers_the_auto_menu_slide(): void
    {
        $keys = array_column(
            \App\Domains\Signage\Services\SignageTemplateFactory::templateCatalog(),
            'key'
        );

        $this->assertContains('auto_menu', $keys);
    }

    public function test_brand_card_template_and_catalog(): void
    {
        $slide = \App\Domains\Signage\Services\SignageTemplateFactory::template('brand_card');
        $this->assertSame('brand_card', $slide['template_origin']);
        $this->assertSame('#0d0a07', $slide['background']['value'] ?? null);

        $types = array_column($slide['elements'], 'type');
        $this->assertContains('logo', $types);
        $texts = array_values(array_filter(
            $slide['elements'],
            fn ($el) => ($el['type'] ?? '') === 'text'
        ));
        $joined = implode(' ', array_map(fn ($el) => (string) ($el['text'] ?? ''), $texts));
        $this->assertStringContainsString('{{branch_name}}', $joined);
        $this->assertStringContainsString('{{business_phone}}', $joined);
        $this->assertStringContainsString('{{business_website}}', $joined);

        $keys = array_column(
            \App\Domains\Signage\Services\SignageTemplateFactory::templateCatalog(),
            'key'
        );
        $this->assertContains('brand_card', $keys);
    }
}
