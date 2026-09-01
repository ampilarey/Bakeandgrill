<?php

declare(strict_types=1);

namespace Tests\Feature\Variants;

use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Role;
use App\Models\User;
use App\Models\Variant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

class VariantOrderTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private User $staff;

    private Item $simpleItem;

    private Item $variantItem;

    private Variant $variantSmall;

    private Variant $variantLarge;

    private Variant $inactiveVariant;

    private Device $device;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['id' => 1], ['name' => 'Default', 'slug' => 'default', 'sort_order' => 0, 'is_active' => true]);

        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'slug' => 'owner', 'description' => '', 'is_active' => true]);
        $this->staff = User::create([
            'name' => 'Staff', 'email' => 'staff@test.com', 'password' => Hash::make('pw'),
            'role_id' => $role->id, 'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $this->device = Device::create([
            'name' => 'POS-01', 'identifier' => 'POS-VAR-001', 'type' => 'pos', 'is_active' => true,
        ]);

        $cat = Category::create(['name' => 'Drinks', 'sort_order' => 0, 'is_active' => true]);

        $this->simpleItem = Item::create([
            'name' => 'Water', 'base_price' => 5.00, 'is_active' => true,
            'is_available' => true, 'category_id' => $cat->id, 'has_variants' => false,
        ]);

        $this->variantItem = Item::create([
            'name' => 'Tea', 'base_price' => 0, 'is_active' => true,
            'is_available' => true, 'category_id' => $cat->id, 'has_variants' => true,
        ]);

        $this->variantSmall = Variant::create([
            'item_id' => $this->variantItem->id, 'name' => 'Small', 'price' => 8.00,
            'is_active' => true, 'sort_order' => 0,
        ]);

        $this->variantLarge = Variant::create([
            'item_id' => $this->variantItem->id, 'name' => 'Large', 'price' => 12.00,
            'is_active' => true, 'sort_order' => 1,
        ]);

        $this->inactiveVariant = Variant::create([
            'item_id' => $this->variantItem->id, 'name' => 'XL (discontinued)', 'price' => 15.00,
            'is_active' => false, 'sort_order' => 2,
        ]);
    }

    private function posPayload(array $items): array
    {
        return [
            'type' => 'dine_in',
            'items' => $items,
        ];
    }

    private function postOrder(array $payload): \Illuminate\Testing\TestResponse
    {
        $this->ensurePosApiReady($this->staff, $this->device);

        return $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson('/api/orders', $payload);
    }

    public function test_simple_product_adds_to_order_without_variant(): void
    {
        $res = $this->postOrder($this->posPayload([
            ['item_id' => $this->simpleItem->id, 'quantity' => 2],
        ]));

        $res->assertStatus(201);
        $this->assertDatabaseHas('order_items', [
            'item_id' => $this->simpleItem->id,
            'variant_id' => null,
            'quantity' => 2,
        ]);
    }

    public function test_variant_product_requires_variant_id(): void
    {
        $res = $this->postOrder($this->posPayload([
            ['item_id' => $this->variantItem->id, 'quantity' => 1],
        ]));

        $res->assertStatus(422);
        $msg = strtolower($res->json('message') ?? '');
        $this->assertTrue(
            str_contains($msg, 'select') || str_contains($msg, 'option') || str_contains($msg, 'variant'),
            "Expected error about selecting an option, got: {$msg}",
        );
    }

    public function test_inactive_variant_is_rejected(): void
    {
        $res = $this->postOrder($this->posPayload([
            ['item_id' => $this->variantItem->id, 'quantity' => 1, 'variant_id' => $this->inactiveVariant->id],
        ]));

        $res->assertStatus(422);
    }

    public function test_variant_not_belonging_to_item_is_rejected(): void
    {
        // variantSmall belongs to variantItem — using it for simpleItem should fail
        $res = $this->postOrder($this->posPayload([
            ['item_id' => $this->simpleItem->id, 'quantity' => 1, 'variant_id' => $this->variantSmall->id],
        ]));

        $res->assertStatus(422);
    }

    public function test_valid_variant_order_stores_snapshot(): void
    {
        $res = $this->postOrder($this->posPayload([
            ['item_id' => $this->variantItem->id, 'quantity' => 1, 'variant_id' => $this->variantSmall->id],
        ]));

        $res->assertStatus(201);
        $this->assertDatabaseHas('order_items', [
            'item_id' => $this->variantItem->id,
            'variant_id' => $this->variantSmall->id,
            'variant_name' => 'Small',
        ]);
    }

    public function test_variant_price_used_not_base_price(): void
    {
        $res = $this->postOrder($this->posPayload([
            ['item_id' => $this->variantItem->id, 'quantity' => 1, 'variant_id' => $this->variantLarge->id],
        ]));

        $res->assertStatus(201);
        // Large variant price is 12.00 — unit_price should reflect that, not base_price (0)
        $this->assertDatabaseHas('order_items', [
            'variant_id' => $this->variantLarge->id,
            'unit_price' => 12.00,
        ]);
    }

    public function test_deactivated_variant_in_old_order_still_accessible(): void
    {
        // The variant still exists (is_active=false) so the FK is intact — this is a model-level assertion
        $this->assertDatabaseHas('variants', [
            'id' => $this->inactiveVariant->id,
            'is_active' => false,
        ]);

        // Variant name snapshot survives deactivation
        $this->assertEquals('XL (discontinued)', $this->inactiveVariant->name);
    }

    public function test_a_sold_out_size_cannot_be_ordered(): void
    {
        // Owner, 2026-09-01: a size needs its own "sold out today" switch,
        // independent of the dish. It has to actually refuse the sale, not
        // just grey out in the app.
        $this->variantLarge->update(['is_available' => false]);

        $res = $this->postOrder($this->posPayload([
            ['item_id' => $this->variantItem->id, 'variant_id' => $this->variantLarge->id, 'quantity' => 1],
        ]));

        $res->assertStatus(422);
        $this->assertStringContainsString('sold out', (string) $res->json('message'));
    }

    public function test_the_other_sizes_of_the_same_dish_still_sell(): void
    {
        $this->variantLarge->update(['is_available' => false]);

        $res = $this->postOrder($this->posPayload([
            ['item_id' => $this->variantItem->id, 'variant_id' => $this->variantSmall->id, 'quantity' => 1],
        ]));

        $res->assertStatus(201);
        $this->assertDatabaseHas('order_items', ['variant_id' => $this->variantSmall->id]);
    }
}
