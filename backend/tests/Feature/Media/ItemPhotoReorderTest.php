<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\ItemPhoto;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ItemPhotoReorderTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsOwner(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $user = User::create([
            'name' => 'Reorder Owner',
            'email' => 'reorder-owner@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);
    }

    public function test_reorder_sets_contiguous_orders_atomically(): void
    {
        $this->actingAsOwner();
        $item = Item::factory()->create();
        $a = ItemPhoto::create(['item_id' => $item->id, 'url' => '/storage/a.jpg', 'sort_order' => 1, 'is_primary' => false]);
        $b = ItemPhoto::create(['item_id' => $item->id, 'url' => '/storage/b.jpg', 'sort_order' => 2, 'is_primary' => false]);
        $c = ItemPhoto::create(['item_id' => $item->id, 'url' => '/storage/c.jpg', 'sort_order' => 3, 'is_primary' => false]);

        $this->postJson("/api/items/{$item->id}/photos/reorder", [
            'order' => [$c->id, $a->id, $b->id],
        ])
            ->assertOk()
            ->assertJsonPath('photos.0.id', $c->id)
            ->assertJsonPath('photos.0.sort_order', 1)
            ->assertJsonPath('photos.1.id', $a->id)
            ->assertJsonPath('photos.1.sort_order', 2)
            ->assertJsonPath('photos.2.id', $b->id)
            ->assertJsonPath('photos.2.sort_order', 3);

        $this->assertSame(1, $c->fresh()->sort_order);
        $this->assertSame(2, $a->fresh()->sort_order);
        $this->assertSame(3, $b->fresh()->sort_order);
    }

    public function test_reorder_rejects_foreign_photo_ids(): void
    {
        $this->actingAsOwner();
        $item = Item::factory()->create();
        $other = Item::factory()->create();
        $a = ItemPhoto::create(['item_id' => $item->id, 'url' => '/storage/a.jpg', 'sort_order' => 1, 'is_primary' => false]);
        $foreign = ItemPhoto::create(['item_id' => $other->id, 'url' => '/storage/x.jpg', 'sort_order' => 1, 'is_primary' => false]);

        $this->postJson("/api/items/{$item->id}/photos/reorder", [
            'order' => [$a->id, $foreign->id],
        ])->assertStatus(422);
    }

    public function test_reorder_rejects_partial_list(): void
    {
        $this->actingAsOwner();
        $item = Item::factory()->create();
        $a = ItemPhoto::create(['item_id' => $item->id, 'url' => '/storage/a.jpg', 'sort_order' => 1, 'is_primary' => false]);
        ItemPhoto::create(['item_id' => $item->id, 'url' => '/storage/b.jpg', 'sort_order' => 2, 'is_primary' => false]);

        $this->postJson("/api/items/{$item->id}/photos/reorder", [
            'order' => [$a->id],
        ])->assertStatus(422);
    }
}
