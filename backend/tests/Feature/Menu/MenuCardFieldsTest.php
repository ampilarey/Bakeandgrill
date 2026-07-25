<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Models\Category;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MenuCardFieldsTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(
            ['id' => 1],
            ['name' => 'Default', 'slug' => 'default', 'sort_order' => 0, 'is_active' => true]
        );

        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'slug' => 'owner', 'description' => '', 'is_active' => true]
        );
        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'owner-card@test.com',
            'password' => Hash::make('pw'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $cat = Category::create(['name' => 'Grill', 'sort_order' => 0, 'is_active' => true]);
        $this->item = Item::create([
            'name' => 'Chicken Grill Platter Extra Large',
            'description' => 'A long description used as the fallback for the little detail line on cards.',
            'base_price' => 85.00,
            'is_active' => true,
            'is_available' => true,
            'category_id' => $cat->id,
            'has_variants' => false,
        ]);
    }

    public function test_migration_adds_menu_card_columns(): void
    {
        foreach ([
            'card_name',
            'card_name_dv',
            'short_description',
            'short_description_dv',
            'price_note',
        ] as $column) {
            $this->assertTrue(Schema::hasColumn('items', $column), "Missing column {$column}");
        }
    }

    public function test_owner_can_persist_menu_card_fields(): void
    {
        Sanctum::actingAs($this->owner, ['*']);

        $res = $this->patchJson("/api/items/{$this->item->id}", [
            'name' => $this->item->name,
            'base_price' => 85,
            'card_name' => 'Chicken Grill',
            'card_name_dv' => 'DV Card',
            'short_description' => 'Smoky & juicy',
            'short_description_dv' => 'DV detail',
            'price_note' => 'from',
        ]);

        $res->assertOk();
        $this->assertDatabaseHas('items', [
            'id' => $this->item->id,
            'card_name' => 'Chicken Grill',
            'card_name_dv' => 'DV Card',
            'short_description' => 'Smoky & juicy',
            'short_description_dv' => 'DV detail',
            'price_note' => 'from',
        ]);
    }

    public function test_validation_rejects_overlong_card_fields(): void
    {
        Sanctum::actingAs($this->owner, ['*']);

        $res = $this->patchJson("/api/items/{$this->item->id}", [
            'name' => $this->item->name,
            'base_price' => 85,
            'card_name' => str_repeat('a', 121),
            'short_description' => str_repeat('b', 141),
            'price_note' => str_repeat('c', 41),
        ]);

        $res->assertStatus(422)
            ->assertJsonValidationErrors(['card_name', 'short_description', 'price_note']);
    }

    public function test_public_items_api_includes_card_fields(): void
    {
        $this->item->update([
            'card_name' => 'Short Name',
            'short_description' => 'Little detail',
            'price_note' => 'per box',
        ]);

        $res = $this->getJson('/api/items');
        $res->assertOk();

        $row = collect($res->json('data') ?? $res->json('items') ?? $res->json())
            ->first(fn ($i) => (int) ($i['id'] ?? 0) === $this->item->id);

        $this->assertNotNull($row, 'Item missing from public items payload');
        $this->assertSame('Short Name', $row['card_name'] ?? null);
        $this->assertSame('Little detail', $row['short_description'] ?? null);
        $this->assertSame('per box', $row['price_note'] ?? null);
    }
}
