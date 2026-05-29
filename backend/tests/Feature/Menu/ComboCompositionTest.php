<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Models\ComboItem;
use App\Models\Item;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ComboCompositionTest extends TestCase
{
    use RefreshDatabase;

    private array $adminHeaders;

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminHeaders = $this->staffHeaders($this->makeOwner());
    }

    public function test_admin_can_create_combo_with_components(): void
    {
        $drink = $this->makeItem(false, [], ['name' => 'Latte']);
        $snack = $this->makeItem(false, [], ['name' => 'Brownie']);

        $response = $this->postJson('/api/items', [
            'name' => 'Coffee Combo',
            'base_price' => 65,
            'is_combo' => true,
            'combo_discount_pct' => 10,
            'combo_items' => [
                ['item_id' => $drink->id, 'quantity' => 1],
                ['item_id' => $snack->id, 'quantity' => 1],
            ],
        ], $this->adminHeaders)->assertCreated();

        $comboId = (int) $response->json('item.id');
        $this->assertDatabaseHas('items', ['id' => $comboId, 'is_combo' => true]);
        $this->assertSame(2, ComboItem::where('combo_id', $comboId)->count());

        $this->patchJson("/api/items/{$comboId}", [
            'is_combo' => false,
        ], $this->adminHeaders)->assertOk();

        $this->assertSame(0, ComboItem::where('combo_id', $comboId)->count());
    }
}
