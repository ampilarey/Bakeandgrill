<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Models\MenuGroup;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PosMenuTest extends TestCase
{
    use RefreshDatabase;

    public function test_pos_menu_returns_categories_and_channel_items_in_one_response(): void
    {
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'POS Food', 'slug' => 'pos-food', 'is_active' => true]);
        $item = Item::create([
            'category_id' => $category->id,
            'name' => 'POS Burger',
            'base_price' => 40.0,
            'sku' => 'POS-BRG',
            'is_active' => true,
            'is_available' => true,
        ]);
        ItemChannelAvailability::query()->updateOrCreate(
            ['item_id' => $item->id, 'channel' => 'dine_in'],
            ['is_enabled' => true],
        );

        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $staff = User::create([
            'name' => 'POS Menu Cashier',
            'email' => 'pos-menu@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        Sanctum::actingAs($staff, ['staff']);

        $response = $this->getJson('/api/pos/menu?channel=dine_in')
            ->assertOk();

        $response->assertJsonPath('categories.0.name', 'POS Food');
        $response->assertJsonPath('items.0.name', 'POS Burger');
        $response->assertJsonStructure([
            'categories' => [['id', 'name']],
            'items' => [['id', 'name', 'availability' => ['available']]],
        ]);
    }
}
