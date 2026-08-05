<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Promotions\Services\PromotionEvaluator;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PlatterGroup;
use App\Models\PlatterGroupItem;
use App\Models\Promotion;
use App\Models\PromotionTarget;
use App\Models\Role;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

class PlatterOrderLinesTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private Category $category;

    private Customer $customer;

    private Item $bajiya;

    private Item $gulha;

    private Item $kimaa;

    private Item $platter;

    private PlatterGroup $group;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);

        $this->category = Category::create([
            'name' => 'Short Eats',
            'slug' => 'short-eats-platter',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'Platter Customer',
            'phone' => '+9607770101',
            'is_active' => true,
        ]);

        $this->bajiya = $this->makeTracked('Bajiya', 50, 'BAJ-P');
        $this->gulha = $this->makeTracked('Gulha', 50, 'GUL-P');
        $this->kimaa = $this->makeTracked('Kimaa', 50, 'KIM-P');

        $this->platter = Item::create([
            'category_id' => $this->category->id,
            'name' => 'Hedhikaa Platter',
            'base_price' => 120,
            'sku' => 'PLATTER-6',
            'is_active' => true,
            'is_available' => true,
            'is_combo' => true,
            'allow_pre_order' => true,
            'tax_code' => 'standard_8',
            'tax_rate' => 8,
        ]);

        $this->group = PlatterGroup::create([
            'item_id' => $this->platter->id,
            'name' => 'Short eats',
            'rule_type' => 'exactly',
            'min_count' => 6,
            'max_count' => 6,
            'sort_order' => 0,
        ]);

        foreach ([$this->bajiya, $this->gulha, $this->kimaa] as $i => $child) {
            PlatterGroupItem::create([
                'platter_group_id' => $this->group->id,
                'item_id' => $child->id,
                'surcharge' => $child->id === $this->gulha->id ? 5 : 0,
                'sort_order' => $i,
            ]);
            $child->update(['allow_pre_order' => true]);
        }
    }

    private function makeTracked(string $name, int $stock, string $sku): Item
    {
        return Item::create([
            'category_id' => $this->category->id,
            'name' => $name,
            'base_price' => 15,
            'sku' => $sku,
            'is_active' => true,
            'is_available' => true,
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => $stock,
            'allow_pre_order' => true,
            'tax_code' => 'standard_8',
            'tax_rate' => 8,
        ]);
    }

    /** @return list<array{item_id: int, quantity: int, group_id: int}> */
    private function sixPicks(int $bajiyaQty = 3, int $gulhaQty = 3): array
    {
        return [
            ['item_id' => $this->bajiya->id, 'quantity' => $bajiyaQty, 'group_id' => $this->group->id],
            ['item_id' => $this->gulha->id, 'quantity' => $gulhaQty, 'group_id' => $this->group->id],
        ];
    }

    private function placeOnlineOrder(array $children, int $platterQty = 1, ?string $collectOn = null): \Illuminate\Testing\TestResponse
    {
        Sanctum::actingAs($this->customer, ['customer']);

        $payload = [
            'type' => 'online_pickup',
            'items' => [[
                'item_id' => $this->platter->id,
                'quantity' => $platterQty,
                'children' => $children,
            ]],
        ];
        if ($collectOn !== null) {
            $payload['collect_on'] = $collectOn;
        }

        return $this->postJson('/api/customer/orders', $payload);
    }

    public function test_rejects_five_and_seven_accepts_six(): void
    {
        $five = $this->placeOnlineOrder([
            ['item_id' => $this->bajiya->id, 'quantity' => 5, 'group_id' => $this->group->id],
        ]);
        $this->assertSame(422, $five->status(), $five->getContent());

        $seven = $this->placeOnlineOrder([
            ['item_id' => $this->bajiya->id, 'quantity' => 7, 'group_id' => $this->group->id],
        ]);
        $this->assertSame(422, $seven->status(), $seven->getContent());

        $six = $this->placeOnlineOrder($this->sixPicks());
        $this->assertSame(201, $six->status(), $six->getContent());
    }

    public function test_price_is_platter_plus_surcharges_not_child_catalog(): void
    {
        $res = $this->placeOnlineOrder($this->sixPicks(3, 3))->assertCreated();
        $orderId = (int) $res->json('order.id');
        $order = Order::with('items')->findOrFail($orderId);

        $parent = $order->items->firstWhere('parent_order_item_id', null);
        $this->assertNotNull($parent);
        $this->assertSame(120.0, (float) $parent->unit_price);
        $this->assertSame(120.0, (float) $parent->total_price);

        $children = $order->items->where('parent_order_item_id', $parent->id);
        $this->assertCount(2, $children);
        $gulha = $children->firstWhere('item_id', $this->gulha->id);
        $this->assertSame(5.0, (float) $gulha->unit_price);
        $this->assertSame(15.0, (float) $gulha->total_price); // 3 × 5

        $bajiya = $children->firstWhere('item_id', $this->bajiya->id);
        $this->assertSame(0.0, (float) $bajiya->unit_price);

        // Never sum child catalog (15 each) — platter 120 + gulha surcharges 15.
        $this->assertEqualsWithDelta(135.0, (float) $order->items->sum('total_price'), 0.01);
    }

    public function test_online_order_reserves_chosen_child_stock_not_catalog_combo(): void
    {
        $beforeB = $this->bajiya->fresh()->stock_quantity;
        $beforeG = $this->gulha->fresh()->stock_quantity;

        $this->placeOnlineOrder($this->sixPicks(4, 2))->assertCreated();

        // Online path reserves — prepared stock column unchanged until paid.
        $this->assertSame($beforeB, $this->bajiya->fresh()->stock_quantity);
        $this->assertSame($beforeG, $this->gulha->fresh()->stock_quantity);

        $reservations = \Illuminate\Support\Facades\DB::table('stock_reservations')->get();
        $byItem = $reservations->groupBy('item_id');
        $this->assertSame(4, (int) $byItem[$this->bajiya->id]->sum('quantity'));
        $this->assertSame(2, (int) $byItem[$this->gulha->id]->sum('quantity'));
        // Platter itself does not track stock — no reservation for platter id.
        $this->assertFalse($byItem->has($this->platter->id));
    }

    public function test_pos_sale_deducts_child_lines_without_combo_double_take(): void
    {
        $staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $staff = User::create([
            'name' => 'Cashier',
            'email' => 'platter-pos@test.com',
            'password' => Hash::make('password'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        // Also seed fixed combo_items that must NOT deduct when platter groups exist.
        \App\Models\ComboItem::create([
            'combo_id' => $this->platter->id,
            'item_id' => $this->kimaa->id,
            'quantity' => 6,
            'is_optional' => false,
        ]);

        $device = $this->makeDevice('pos', ['identifier' => 'PLATTER-POS-1']);
        $this->ensurePosApiReady($staff, $device);

        $res = $this->withHeader('X-Device-Identifier', $device->identifier)
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [[
                    'item_id' => $this->platter->id,
                    'quantity' => 1,
                    'children' => $this->sixPicks(3, 3),
                ]],
            ]);
        $this->assertSame(201, $res->status(), $res->getContent());

        $this->assertSame(47, $this->bajiya->fresh()->stock_quantity);
        $this->assertSame(47, $this->gulha->fresh()->stock_quantity);
        // Fixed combo expansion must not also take kimaa.
        $this->assertSame(50, $this->kimaa->fresh()->stock_quantity);
        $this->assertSame(0, StockMovement::where('item_id', $this->kimaa->id)->count());
    }

    public function test_tomorrow_requires_each_child_allow_pre_order(): void
    {
        $this->gulha->update(['allow_pre_order' => false]);

        // Ensure tomorrow gate is open.
        \App\Models\SiteSetting::set('order_for_tomorrow_enabled', '1');

        $res = $this->placeOnlineOrder($this->sixPicks(), 1, 'tomorrow');
        $this->assertSame(422, $res->status(), $res->getContent());
    }

    public function test_bogo_and_triggers_skip_platter_children(): void
    {
        $res = $this->placeOnlineOrder($this->sixPicks())->assertCreated();
        $order = Order::with('items.item')->findOrFail((int) $res->json('order.id'));

        $promo = Promotion::create([
            'name' => 'Free gulha with bajiya',
            'code' => null,
            'type' => 'free_item',
            'discount_value' => 0,
            'auto_apply' => true,
            'is_active' => true,
            'stackable' => false,
            'scope' => 'item',
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->bajiya->id,
            'role' => 'trigger',
            'is_exclusion' => false,
            'metadata' => ['min_qty' => 1],
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->gulha->id,
            'role' => 'reward',
            'is_exclusion' => false,
        ]);

        $evaluator = app(PromotionEvaluator::class);
        $reflection = new \ReflectionClass($evaluator);
        $method = $reflection->getMethod('candidateOrderLines');
        $method->setAccessible(true);
        /** @var \Illuminate\Support\Collection $lines */
        $lines = $method->invoke($evaluator, $order);

        $this->assertTrue($lines->every(fn (OrderItem $l) => $l->parent_order_item_id === null));
        $this->assertFalse($lines->contains(fn (OrderItem $l) => $l->item_id === $this->bajiya->id));
        $this->assertTrue($lines->contains(fn (OrderItem $l) => $l->item_id === $this->platter->id));

        // Entitlement must not treat platter children as triggers even if listed.
        $choices = $evaluator->earnedRewardChoices($order->items->map(fn (OrderItem $l) => [
            'item_id' => $l->item_id,
            'quantity' => $l->quantity,
            'unit_price' => (float) $l->unit_price,
            'total_price' => (float) $l->total_price,
            'parent_order_item_id' => $l->parent_order_item_id,
        ])->all());
        $this->assertSame([], $choices);
    }

    public function test_kds_payload_includes_parent_order_item_id(): void
    {
        $res = $this->placeOnlineOrder($this->sixPicks())->assertCreated();
        $orderId = (int) $res->json('order.id');
        Order::where('id', $orderId)->update(['status' => 'paid', 'payment_status' => 'paid']);

        $staffRole = Role::firstOrCreate(['slug' => 'kitchen_staff'], ['name' => 'Kitchen', 'is_active' => true]);
        $kitchen = User::create([
            'name' => 'Cook',
            'email' => 'platter-kds@test.com',
            'password' => Hash::make('password'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($kitchen, ['staff']);

        $kds = $this->getJson('/api/kds/orders?status=paid')->assertOk();
        $ticket = collect($kds->json('orders') ?? $kds->json('data') ?? [])
            ->firstWhere('id', $orderId);
        $this->assertNotNull($ticket, 'KDS ticket missing: '.$kds->getContent());

        $parent = collect($ticket['items'])->firstWhere('item_id', $this->platter->id);
        $this->assertNotNull($parent);
        $this->assertNull($parent['parent_order_item_id']);

        $child = collect($ticket['items'])->firstWhere('item_id', $this->bajiya->id);
        $this->assertNotNull($child);
        $this->assertSame($parent['id'], $child['parent_order_item_id']);
    }
}
