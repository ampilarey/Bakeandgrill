<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Domains\Kitchen\Services\KitchenMenuResolver;
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

/**
 * Phase 1 catering menu foundation — flags are display-only;
 * immediate orderability still requires dine_in/takeaway/pickup/delivery.
 */
class CateringMenuFoundationTest extends TestCase
{
    use RefreshDatabase;

    private function seedMenuGroup(): MenuGroup
    {
        return MenuGroup::firstOrCreate(
            ['slug' => 'default'],
            ['name' => 'Default', 'is_active' => true, 'sort_order' => 0],
        );
    }

    private function enableChannels(Item $item, array $channels): void
    {
        foreach (KitchenMenuResolver::CHANNELS as $ch) {
            ItemChannelAvailability::query()->updateOrCreate(
                ['item_id' => $item->id, 'channel' => $ch],
                ['is_enabled' => in_array($ch, $channels, true)],
            );
        }
    }

    private function actingAsStaff(): User
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $user = User::create([
            'name' => 'Catering Menu Owner',
            'email' => 'catering-menu@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);

        return $user;
    }

    public function test_tray_with_catering_and_takeaway_is_orderable_and_flagged(): void
    {
        $this->seedMenuGroup();
        $category = Category::create(['name' => 'Trays', 'slug' => 'trays', 'is_active' => true]);
        $tray = Item::create([
            'category_id' => $category->id,
            'menu_group_id' => 1,
            'name' => 'Fried Rice Tray',
            'base_price' => 450,
            'is_active' => true,
            'is_available' => true,
        ]);
        $this->enableChannels($tray, ['takeaway', 'delivery', 'catering', 'online_pickup']);

        $takeaway = $this->getJson('/api/items?channel=takeaway&available_only=1')
            ->assertOk()
            ->json('data');
        $row = collect($takeaway)->firstWhere('id', $tray->id);
        $this->assertNotNull($row);
        $this->assertTrue($row['is_catering']);

        $this->actingAsStaff();
        $pos = $this->getJson('/api/pos/menu?channel=takeaway')->assertOk()->json('items');
        $posRow = collect($pos)->firstWhere('id', $tray->id);
        $this->assertNotNull($posRow);
        $this->assertTrue($posRow['is_catering']);
    }

    public function test_catering_only_item_not_in_immediate_menus_or_orderable(): void
    {
        $this->seedMenuGroup();
        $category = Category::create(['name' => 'Events', 'slug' => 'events', 'is_active' => true]);
        $buffet = Item::create([
            'category_id' => $category->id,
            'menu_group_id' => 1,
            'name' => 'Buffet Package',
            'base_price' => 2500,
            'is_active' => true,
            'is_available' => true,
        ]);
        $this->enableChannels($buffet, ['catering']);

        foreach (['takeaway', 'dine_in', 'online_pickup', 'delivery'] as $ch) {
            $ids = collect(
                $this->getJson("/api/items?channel={$ch}&available_only=1")->json('data') ?? [],
            )->pluck('id')->all();
            $this->assertNotContains($buffet->id, $ids, "buffet should be absent from {$ch}");
        }

        $this->actingAsStaff();
        $posIds = collect(
            $this->getJson('/api/pos/menu?channel=takeaway')->json('items') ?? [],
        )->pluck('id')->all();
        $this->assertNotContains($buffet->id, $posIds);

        $resolver = app(KitchenMenuResolver::class);
        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        $resolver->assertLineItemsAllowedForOrderType(
            [$buffet->id => $buffet],
            [['item_id' => $buffet->id]],
            'takeaway',
        );
    }

    public function test_admin_channel_matrix_round_trips_catering_flag(): void
    {
        $this->seedMenuGroup();
        $this->actingAsStaff();
        $category = Category::create(['name' => 'Cat', 'slug' => 'cat-rt', 'is_active' => true]);

        $create = $this->postJson('/api/items', [
            'name' => 'Event Tray',
            'base_price' => 100,
            'category_id' => $category->id,
            'menu_group_id' => 1,
            'channel_availability' => [
                ['channel' => 'dine_in', 'is_enabled' => false],
                ['channel' => 'takeaway', 'is_enabled' => true],
                ['channel' => 'online_pickup', 'is_enabled' => false],
                ['channel' => 'delivery', 'is_enabled' => true],
                ['channel' => 'catering', 'is_enabled' => true],
            ],
        ])->assertCreated();

        $id = $create->json('item.id');
        $this->assertNotNull($id);

        $show = $this->getJson('/api/items?admin=1')->assertOk();
        $item = collect($show->json('data') ?? [])->firstWhere('id', $id);
        $this->assertNotNull($item);
        $this->assertTrue($item['is_catering']);
        $channels = collect($item['channel_availabilities'] ?? []);
        $this->assertTrue($channels->firstWhere('channel', 'catering')['is_enabled']);
        $this->assertTrue($channels->firstWhere('channel', 'takeaway')['is_enabled']);
        $this->assertFalse($channels->firstWhere('channel', 'dine_in')['is_enabled']);
    }

    public function test_ordering_channels_still_exclude_catering(): void
    {
        $this->assertNotContains('catering', KitchenMenuResolver::ORDERING_CHANNELS);
        $this->assertContains('catering', KitchenMenuResolver::CHANNELS);
        $this->assertSame(
            'online_pickup',
            app(KitchenMenuResolver::class)->channelForOrderType('catering'),
        );
    }
}
