<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Promotion;
use App\Models\Role;
use App\Models\User;
use App\Models\Variant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * One answer for anything the till scans. Owner, 2026-09-02: a gun, the
 * camera or the search box hand the till a code; the till should not have
 * to guess what it is.
 */
class PosScanTest extends TestCase
{
    use RefreshDatabase;

    private Category $category;

    protected function setUp(): void
    {
        parent::setUp();
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        Sanctum::actingAs(User::create([
            'name' => 'Boss', 'email' => 'boss@test.local', 'password' => Hash::make('password'),
            'role_id' => $role->id, 'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]), ['staff']);
        $this->category = Category::create(['name' => 'Food', 'slug' => 'food', 'is_active' => true]);
    }

    private function item(string $name, ?string $barcode = null): Item
    {
        return Item::create([
            'category_id' => $this->category->id, 'name' => $name, 'base_price' => 10,
            'barcode' => $barcode, 'is_active' => true, 'is_available' => true,
        ]);
    }

    public function test_an_item_barcode_is_an_item(): void
    {
        $item = $this->item('Water', '8801234567890');

        $this->getJson('/api/pos/scan?code=8801234567890')
            ->assertOk()
            ->assertJsonPath('kind', 'item')
            ->assertJsonPath('item.id', $item->id)
            ->assertJsonPath('variant', null);
    }

    public function test_a_size_with_its_own_code_comes_back_with_its_size(): void
    {
        $item = $this->item('Water');
        $large = Variant::create(['item_id' => $item->id, 'name' => 'Large', 'price' => 15, 'barcode' => '5550001', 'is_active' => true]);

        $this->getJson('/api/pos/scan?code=5550001')
            ->assertOk()
            ->assertJsonPath('kind', 'item')
            ->assertJsonPath('item.id', $item->id)
            ->assertJsonPath('variant.id', $large->id);
    }

    public function test_a_gift_card_is_known_by_its_shape_even_inside_a_link(): void
    {
        $this->getJson('/api/pos/scan?code=gc-20260902-0007')
            ->assertOk()
            ->assertJsonPath('kind', 'gift_card')
            ->assertJsonPath('code', 'GC-20260902-0007');

        $this->getJson('/api/pos/scan?code=' . rawurlencode('https://bakeandgrill.mv/gift-cards/view/GC-20260902-0007?x=1'))
            ->assertOk()
            ->assertJsonPath('kind', 'gift_card')
            ->assertJsonPath('code', 'GC-20260902-0007');
    }

    public function test_a_promotion_or_discount_card_code_is_a_promotion(): void
    {
        Promotion::create([
            'name' => 'Discount card', 'code' => 'DC-AB12-CD34', 'type' => 'percentage', 'discount_value' => 10,
            'is_active' => true, 'starts_at' => now()->subDay(), 'expires_at' => now()->addDay(),
        ]);

        $this->getJson('/api/pos/scan?code=dc-ab12-cd34')
            ->assertOk()
            ->assertJsonPath('kind', 'promotion')
            ->assertJsonPath('code', 'DC-AB12-CD34')
            ->assertJsonPath('valid', true);
    }

    public function test_a_customer_code_or_bare_phone_is_the_customer(): void
    {
        $customer = Customer::create(['name' => 'Hassan', 'phone' => '7771234']);

        $this->getJson('/api/pos/scan?code=BG-C-7771234')
            ->assertOk()
            ->assertJsonPath('kind', 'customer')
            ->assertJsonPath('customer.id', $customer->id)
            ->assertJsonPath('customer.name', 'Hassan');

        $this->getJson('/api/pos/scan?code=7771234')
            ->assertOk()
            ->assertJsonPath('kind', 'customer');
    }

    public function test_an_item_wins_over_a_phone_shaped_barcode(): void
    {
        Customer::create(['name' => 'Hassan', 'phone' => '7771234']);
        $item = $this->item('Bajiya', '7771234');

        $this->getJson('/api/pos/scan?code=7771234')
            ->assertOk()
            ->assertJsonPath('kind', 'item')
            ->assertJsonPath('item.id', $item->id);
    }

    public function test_nothing_matching_is_unknown(): void
    {
        $this->getJson('/api/pos/scan?code=NOPE-1234')
            ->assertOk()
            ->assertJsonPath('kind', 'unknown');
    }

    public function test_a_customer_token_is_refused(): void
    {
        $customer = Customer::create(['name' => 'Hassan', 'phone' => '7771234']);
        Sanctum::actingAs($customer, ['customer']);

        $this->getJson('/api/pos/scan?code=7771234')->assertStatus(403);
    }
}
