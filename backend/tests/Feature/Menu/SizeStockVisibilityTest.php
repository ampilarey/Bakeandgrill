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
use App\Models\Variant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A size that tracks its own stock and has none left.
 *
 * Before 2026-09-21 the menu feeds folded two things into a size's
 * `is_available` — the owner's daily toggle and the shared ingredient pool —
 * and not the size's own stock count. A 1.5L bottle with "Track stock" on and
 * nothing on the shelf looked pickable in the order app and on the till, and
 * the customer found out at checkout with "Insufficient stock".
 */
class SizeStockVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private Item $water;

    private Variant $small;

    private Variant $large;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $cat = Category::create(['name' => 'Drinks', 'slug' => 'drinks-size-stock', 'is_active' => true]);

        $this->water = Item::create([
            'category_id' => $cat->id,
            'name' => 'Water',
            'base_price' => 0,
            'sku' => 'WATER-SIZES',
            'is_active' => true,
            'is_available' => true,
            'has_variants' => true,
        ]);
        foreach (KitchenMenuResolver::ORDERING_CHANNELS as $channel) {
            ItemChannelAvailability::query()->updateOrCreate(
                ['item_id' => $this->water->id, 'channel' => $channel],
                ['is_enabled' => true],
            );
        }

        $this->small = Variant::create([
            'item_id' => $this->water->id, 'name' => '500ml', 'price' => 10, 'is_active' => true,
            'sort_order' => 0, 'track_stock' => true, 'stock_qty' => 4,
        ]);
        $this->large = Variant::create([
            'item_id' => $this->water->id, 'name' => '1.5L', 'price' => 20, 'is_active' => true,
            'sort_order' => 1, 'track_stock' => true, 'stock_qty' => 0,
        ]);
    }

    /** @return array<string, mixed> */
    private function publicRow(): array
    {
        $row = collect($this->getJson('/api/items?channel=online_pickup')->assertOk()->json('data'))
            ->firstWhere('id', $this->water->id);
        $this->assertNotNull($row);

        return $row;
    }

    /** @return array<string, mixed> */
    private function posRow(): array
    {
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        $staff = User::create([
            'name' => 'Cashier', 'email' => 'size-stock@test.local', 'password' => Hash::make('password'),
            'role_id' => $role->id, 'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        Sanctum::actingAs($staff, ['staff']);

        $row = collect($this->getJson('/api/pos/menu?channel=dine_in')->assertOk()->json('items'))
            ->firstWhere('id', $this->water->id);
        $this->assertNotNull($row);

        return $row;
    }

    /** @param array<string, mixed> $row */
    private function sizeRow(array $row, int $id): array
    {
        $size = collect($row['variants'])->firstWhere('id', $id);
        $this->assertNotNull($size);

        return $size;
    }

    public function test_the_order_app_greys_out_a_size_with_no_stock_and_keeps_the_dish_on_the_menu(): void
    {
        $row = $this->publicRow();

        $this->assertTrue($row['available_now']);
        $this->assertSame(4, $this->sizeRow($row, $this->small->id)['available_stock']);
        $this->assertTrue($this->sizeRow($row, $this->small->id)['is_available']);
        $this->assertSame(0, $this->sizeRow($row, $this->large->id)['available_stock']);
        $this->assertFalse($this->sizeRow($row, $this->large->id)['is_available']);
    }

    public function test_the_till_gets_the_same_verdict(): void
    {
        $row = $this->posRow();

        $this->assertTrue($row['availability']['available']);
        $this->assertTrue($this->sizeRow($row, $this->small->id)['is_available']);
        $this->assertFalse($this->sizeRow($row, $this->large->id)['is_available']);
        $this->assertSame(0, $this->sizeRow($row, $this->large->id)['available_stock']);
    }

    public function test_a_dish_whose_every_size_has_run_out_is_sold_out(): void
    {
        $this->small->update(['stock_qty' => 0]);

        $row = $this->publicRow();
        $this->assertFalse($row['available_now']);
        $this->assertSame('out_of_stock', $row['unavailable_reason']);

        $pos = $this->posRow();
        $this->assertFalse($pos['availability']['available']);
        $this->assertSame('out_of_stock', $pos['availability']['reason_code']);
    }

    public function test_a_live_online_hold_counts_against_the_size(): void
    {
        // Three of the four small bottles are held by a checkout in progress.
        DB::table('stock_reservations')->insert([
            'item_id' => $this->water->id, 'variant_id' => $this->small->id, 'quantity' => 3,
            'session_id' => 'sess-hold', 'expires_at' => now()->addMinutes(2),
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->assertSame(1, $this->sizeRow($this->publicRow(), $this->small->id)['available_stock']);
    }

    public function test_a_size_that_does_not_track_stock_is_untouched(): void
    {
        $this->large->update(['track_stock' => false, 'stock_qty' => 0]);

        $large = $this->sizeRow($this->publicRow(), $this->large->id);
        $this->assertArrayNotHasKey('is_available', $large);
        $this->assertArrayNotHasKey('available_stock', $large);
    }
}
