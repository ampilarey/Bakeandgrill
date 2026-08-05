<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Models\PlatterGroup;
use App\Models\PlatterGroupItem;
use App\Models\Variant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlatterCompositionTest extends TestCase
{
    use RefreshDatabase;

    private array $adminHeaders;

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminHeaders = $this->staffHeaders($this->makeOwner());
    }

    public function test_admin_can_create_platter_with_choose_any_six(): void
    {
        $a = $this->makeItem(false, 10, ['name' => 'Bajiya']);
        $b = $this->makeItem(false, 10, ['name' => 'Gulha']);
        $c = $this->makeItem(false, 10, ['name' => 'Bis Keemiya']);

        $response = $this->postJson('/api/items', [
            'name' => 'Hedhikaa Platter',
            'base_price' => 120,
            'is_combo' => true,
            'platter_groups' => [
                [
                    'name' => 'Short eats',
                    'rule_type' => 'exactly',
                    'min_count' => 6,
                    'max_count' => 6,
                    'items' => [
                        ['item_id' => $a->id, 'surcharge' => 0],
                        ['item_id' => $b->id, 'surcharge' => 0],
                        ['item_id' => $c->id, 'surcharge' => 5],
                    ],
                ],
            ],
        ], $this->adminHeaders)->assertCreated();

        $platterId = (int) $response->json('item.id');
        $this->assertDatabaseHas('items', ['id' => $platterId, 'is_combo' => true]);
        $this->assertSame(1, PlatterGroup::where('item_id', $platterId)->count());
        $this->assertSame(3, PlatterGroupItem::whereHas('group', fn ($q) => $q->where('item_id', $platterId))->count());

        $group = PlatterGroup::where('item_id', $platterId)->first();
        $this->assertSame('exactly', $group->rule_type);
        $this->assertSame(6, $group->min_count);
        $this->assertSame(6, $group->max_count);

        $list = $this->getJson('/api/items?per_page=100', $this->adminHeaders)->assertOk();
        $row = collect($list->json('data'))->firstWhere('id', $platterId);
        $this->assertNotNull($row);
        $this->assertTrue($row['is_platter']);
        $this->assertCount(1, $row['platter_groups']);
        $this->assertSame('Short eats', $row['platter_groups'][0]['name']);
        $this->assertSame(6, $row['platter_groups'][0]['min_count']);
        $this->assertCount(3, $row['platter_groups'][0]['items']);
    }

    public function test_admin_can_create_tiered_platter_with_size_counts(): void
    {
        $a = $this->makeItem(false, 10, ['name' => 'Bajiya']);
        $b = $this->makeItem(false, 10, ['name' => 'Gulha']);

        $response = $this->postJson('/api/items', [
            'name' => 'Party Platter',
            'base_price' => 0,
            'is_combo' => true,
            'has_variants' => true,
            'variants' => [
                ['name' => '6 piece', 'price' => 120, 'is_active' => true, 'sort_order' => 0],
                ['name' => '9 piece', 'price' => 165, 'is_active' => true, 'sort_order' => 1],
                ['name' => '12 piece', 'price' => 210, 'is_active' => true, 'sort_order' => 2],
            ],
            'platter_groups' => [
                [
                    'name' => 'Short eats',
                    'rule_type' => 'exactly',
                    // Keys by variant name on create — resolved to variant ids after sync.
                    'size_counts' => [
                        '6 piece' => 6,
                        '9 piece' => 9,
                        '12 piece' => 12,
                    ],
                    'items' => [
                        ['item_id' => $a->id],
                        ['item_id' => $b->id, 'surcharge' => 3],
                    ],
                ],
            ],
        ], $this->adminHeaders)->assertCreated();

        $platterId = (int) $response->json('item.id');
        $group = PlatterGroup::where('item_id', $platterId)->first();
        $this->assertNotNull($group);

        $variants = Variant::where('item_id', $platterId)->orderBy('sort_order')->get();
        $this->assertCount(3, $variants);

        $counts = $group->size_counts;
        $this->assertSame(6, $counts[(string) $variants[0]->id]);
        $this->assertSame(9, $counts[(string) $variants[1]->id]);
        $this->assertSame(12, $counts[(string) $variants[2]->id]);
    }

    public function test_admin_can_update_platter_definition(): void
    {
        $a = $this->makeItem(false, 10, ['name' => 'Bajiya']);
        $b = $this->makeItem(false, 10, ['name' => 'Gulha']);
        $c = $this->makeItem(false, 10, ['name' => 'Kimaa']);

        $create = $this->postJson('/api/items', [
            'name' => 'Mixed Platter',
            'base_price' => 150,
            'is_combo' => true,
            'platter_groups' => [
                [
                    'name' => 'Savoury',
                    'rule_type' => 'exactly',
                    'min_count' => 4,
                    'items' => [
                        ['item_id' => $a->id],
                        ['item_id' => $b->id],
                    ],
                ],
            ],
        ], $this->adminHeaders)->assertCreated();

        $platterId = (int) $create->json('item.id');

        $this->patchJson("/api/items/{$platterId}", [
            'platter_groups' => [
                [
                    'name' => 'Savoury',
                    'rule_type' => 'exactly',
                    'min_count' => 4,
                    'items' => [
                        ['item_id' => $a->id],
                        ['item_id' => $b->id],
                    ],
                ],
                [
                    'name' => 'Sweet',
                    'rule_type' => 'min',
                    'min_count' => 2,
                    'items' => [
                        ['item_id' => $c->id, 'surcharge' => 0],
                    ],
                ],
            ],
        ], $this->adminHeaders)->assertOk();

        $this->assertSame(2, PlatterGroup::where('item_id', $platterId)->count());
        $sweet = PlatterGroup::where('item_id', $platterId)->where('name', 'Sweet')->first();
        $this->assertSame('min', $sweet->rule_type);
        $this->assertSame(2, $sweet->min_count);
        $this->assertNull($sweet->max_count);

        // Turning off combo clears platter groups.
        $this->patchJson("/api/items/{$platterId}", [
            'is_combo' => false,
        ], $this->adminHeaders)->assertOk();

        $this->assertSame(0, PlatterGroup::where('item_id', $platterId)->count());
    }

    public function test_platter_group_requires_allowed_items(): void
    {
        $this->postJson('/api/items', [
            'name' => 'Empty Platter',
            'base_price' => 100,
            'is_combo' => true,
            'platter_groups' => [
                [
                    'name' => 'Short eats',
                    'rule_type' => 'exactly',
                    'min_count' => 6,
                    'items' => [],
                ],
            ],
        ], $this->adminHeaders)->assertStatus(422);
    }

    public function test_public_menu_exposes_platter_groups_without_capacity_secret(): void
    {
        $a = $this->makeItem(false, 10, [
            'name' => 'Bajiya',
            'allow_pre_order' => true,
            'tomorrow_daily_capacity' => 8,
        ]);
        $b = $this->makeItem(false, 10, ['name' => 'Gulha', 'allow_pre_order' => true]);

        $create = $this->postJson('/api/items', [
            'name' => 'Hedhikaa Platter',
            'base_price' => 120,
            'is_combo' => true,
            'platter_groups' => [
                [
                    'name' => 'Short eats',
                    'rule_type' => 'exactly',
                    'min_count' => 6,
                    'max_count' => 6,
                    'items' => [
                        ['item_id' => $a->id],
                        ['item_id' => $b->id, 'surcharge' => 5],
                    ],
                ],
            ],
        ], $this->adminHeaders)->assertCreated();

        $platterId = (int) $create->json('item.id');

        // Staff bearer from the create call leaves the guard authenticated — clear it
        // so this request hits the public menu transformer.
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();

        $list = $this->getJson('/api/items?channel=online_pickup')->assertOk();
        $row = collect($list->json('data'))->firstWhere('id', $platterId);
        $this->assertNotNull($row, 'Platter missing from public /api/items');
        $this->assertArrayHasKey('available_now', $row, 'Expected public availability fields; got: '.implode(',', array_keys($row)));
        $this->assertTrue($row['is_platter']);
        $this->assertCount(1, $row['platter_groups']);
        $this->assertSame(6, $row['platter_groups'][0]['min_count']);
        $this->assertCount(2, $row['platter_groups'][0]['items']);
        $this->assertArrayNotHasKey('tomorrow_daily_capacity', $row);
        $child = collect($row['platter_groups'][0]['items'])->firstWhere('item_id', $a->id);
        $this->assertNotNull($child);
        $this->assertNotNull($child['item']);
        $this->assertArrayHasKey('tomorrow_remaining', $child['item']);
        $this->assertArrayNotHasKey('tomorrow_daily_capacity', $child['item']);
        $this->assertTrue($child['item']['allow_pre_order']);
        $this->assertArrayHasKey('available_now', $child['item']);
        $this->assertSame(8, $child['item']['tomorrow_remaining']);
    }
}
