<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CategoryDeleteTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsOwner(): User
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $user = User::create([
            'name' => 'Category Delete Owner',
            'email' => 'cat-delete-owner@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);

        return $user;
    }

    public function test_can_delete_empty_category(): void
    {
        $this->actingAsOwner();
        $category = Category::create(['name' => 'Empty', 'is_active' => true]);

        $this->deleteJson("/api/categories/{$category->id}")
            ->assertOk()
            ->assertJsonPath('message', 'Category deleted successfully');

        $this->assertDatabaseMissing('categories', ['id' => $category->id]);
    }

    public function test_can_delete_category_that_only_has_soft_deleted_items(): void
    {
        $this->actingAsOwner();
        $category = Category::create(['name' => 'Ghosts', 'is_active' => true]);
        $item = Item::create([
            'name' => 'Retired Tray',
            'base_price' => 10,
            'is_active' => true,
            'is_available' => true,
            'category_id' => $category->id,
            'has_variants' => false,
        ]);
        $item->delete();

        $this->assertSame(0, $category->items()->count());
        $this->assertSame(1, $category->items()->withTrashed()->count());

        $this->deleteJson("/api/categories/{$category->id}")
            ->assertOk();

        $this->assertDatabaseMissing('categories', ['id' => $category->id]);
        $this->assertDatabaseHas('items', [
            'id' => $item->id,
            'category_id' => null,
        ]);
    }

    public function test_cannot_delete_category_with_live_items(): void
    {
        $this->actingAsOwner();
        $category = Category::create(['name' => 'Busy', 'is_active' => true]);
        Item::create([
            'name' => 'Live Burger',
            'base_price' => 40,
            'is_active' => true,
            'is_available' => true,
            'category_id' => $category->id,
            'has_variants' => false,
        ]);

        $this->deleteJson("/api/categories/{$category->id}")
            ->assertStatus(422)
            ->assertJsonPath(
                'message',
                'Cannot delete category with items. Please move or delete items first.',
            );

        $this->assertDatabaseHas('categories', ['id' => $category->id]);
    }
}
