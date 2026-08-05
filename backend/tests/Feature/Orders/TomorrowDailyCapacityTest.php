<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\SiteSetting;
use App\Services\OrderFulfilDateService;
use App\Services\TomorrowDailyCapacityService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Per-item daily capacity for collect-tomorrow orders.
 * Cap is across all customers for the same fulfil_date; null = unlimited.
 */
class TomorrowDailyCapacityTest extends TestCase
{
    use RefreshDatabase;

    private Item $item;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);

        $category = Category::create([
            'name' => 'Capacity Cat',
            'slug' => 'capacity-cat',
            'is_active' => true,
        ]);

        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Capacity Bread',
            'base_price' => 25.0,
            'sku' => 'CAP-BREAD-001',
            'is_active' => true,
            'is_available' => true,
            'allow_pre_order' => true,
            'tomorrow_daily_capacity' => 10,
        ]);

        $this->customer = Customer::create([
            'name' => 'Capacity Customer',
            'phone' => '+9607770888',
            'is_active' => true,
        ]);

        $this->setSetting('online_ordering_enabled', '1');
        $this->setSetting(OrderFulfilDateService::SETTING_KEY, '20:00');
        $this->setSetting('delivery_accepting_orders', '1');
        // Outside the delivery window so same-day delivery would be blocked;
        // tomorrow delivery still proceeds (driver arranged in advance).
        $this->setSetting('delivery_schedule', json_encode([
            'tue' => [['open' => '18:00', 'close' => '22:00']],
        ]));

        Carbon::setTestNow(Carbon::parse('2026-08-04 15:00:00', config('app.timezone')));
    }

    private function setSetting(string $key, ?string $value): void
    {
        SiteSetting::updateOrCreate(['key' => $key], [
            'value' => $value,
            'type' => 'text',
            'group' => 'Online Ordering',
            'label' => $key,
            'is_public' => true,
        ]);
        Cache::forget("site_setting.{$key}");
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function seedCommitted(int $qty, ?string $fulfilDate = null, string $status = 'payment_pending'): Order
    {
        $date = $fulfilDate ?? app(OrderFulfilDateService::class)->allowedTomorrowDateString();
        $order = Order::create([
            'order_number' => 'CAP-' . uniqid(),
            'type' => 'online_pickup',
            'status' => $status,
            'customer_id' => $this->customer->id,
            'subtotal' => 25.0 * $qty,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 25.0 * $qty,
            'fulfil_date' => $date,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $this->item->id,
            'item_name' => $this->item->name,
            'quantity' => $qty,
            'unit_price' => 25.0,
            'total_price' => 25.0 * $qty,
            'status' => 'pending',
        ]);

        return $order;
    }

    private function pickupPayload(int $qty): array
    {
        return [
            'type' => 'online_pickup',
            'collect_on' => 'tomorrow',
            'items' => [
                ['item_id' => $this->item->id, 'quantity' => $qty],
            ],
        ];
    }

    private function deliveryPayload(int $qty): array
    {
        return [
            'items' => [
                ['item_id' => $this->item->id, 'quantity' => $qty],
            ],
            'collect_on' => 'tomorrow',
            'delivery_address_line1' => 'H. Test House',
            'delivery_island' => "Male'",
            'delivery_contact_name' => 'Capacity Customer',
            'delivery_contact_phone' => '7770888',
        ];
    }

    public function test_request_over_remaining_is_rejected_with_remaining_count(): void
    {
        $this->seedCommitted(8);
        Sanctum::actingAs($this->customer, ['customer']);

        $res = $this->postJson('/api/customer/orders', $this->pickupPayload(5));

        $res->assertStatus(422);
        $this->assertStringContainsString('Only 2 left for collection tomorrow', (string) $res->getContent());
        $this->assertSame(1, Order::count(), 'Rejected request must not create an order');
    }

    public function test_request_within_remaining_is_accepted(): void
    {
        $this->seedCommitted(8);
        Sanctum::actingAs($this->customer, ['customer']);

        $res = $this->postJson('/api/customer/orders', $this->pickupPayload(2));

        $res->assertCreated();
        $this->assertSame(2, Order::count());
    }

    public function test_cancelled_and_refunded_orders_do_not_consume_capacity(): void
    {
        $this->seedCommitted(8, null, 'cancelled');
        $this->seedCommitted(8, null, 'refunded');
        Sanctum::actingAs($this->customer, ['customer']);

        // Full capacity of 10 still available.
        $res = $this->postJson('/api/customer/orders', $this->pickupPayload(10));
        $res->assertCreated();
    }

    public function test_different_fulfil_date_does_not_consume_capacity(): void
    {
        $otherDate = Carbon::parse('2026-08-10', config('app.timezone'))->toDateString();
        $this->seedCommitted(10, $otherDate);
        Sanctum::actingAs($this->customer, ['customer']);

        $res = $this->postJson('/api/customer/orders', $this->pickupPayload(10));
        $res->assertCreated();
    }

    public function test_null_capacity_is_unlimited(): void
    {
        $this->item->update(['tomorrow_daily_capacity' => null]);
        Sanctum::actingAs($this->customer, ['customer']);

        // Request validation caps line qty at 99 — still far above any kitchen make-limit.
        $res = $this->postJson('/api/customer/orders', $this->pickupPayload(99));
        $res->assertCreated();
    }

    public function test_enforced_on_delivery_create_path(): void
    {
        $this->seedCommitted(8);
        Sanctum::actingAs($this->customer, ['customer']);

        $rejected = $this->postJson('/api/orders/delivery', $this->deliveryPayload(5));
        $rejected->assertStatus(422);
        $this->assertStringContainsString('Only 2 left for collection tomorrow', (string) $rejected->getContent());

        $ok = $this->postJson('/api/orders/delivery', $this->deliveryPayload(2));
        $ok->assertCreated();
    }

    /**
     * Race simulation (sqlite in-memory cannot block two live connections):
     * two sequential DB::transaction blocks each take Item::lockForUpdate()
     * before reading committed qty — the same critical section production uses.
     * First transaction inserts the last unit and commits; the second must see
     * remaining=0 and throw. This proves the lock + re-read path is wired, not
     * a TOCTOU check outside the transaction.
     */
    public function test_concurrent_last_unit_exactly_one_succeeds(): void
    {
        $this->item->update(['tomorrow_daily_capacity' => 1]);
        $date = app(OrderFulfilDateService::class)->allowedTomorrowDateString();
        $svc = app(TomorrowDailyCapacityService::class);

        $wins = 0;
        $losses = 0;

        for ($i = 0; $i < 2; $i++) {
            try {
                DB::transaction(function () use ($svc, $date, &$wins) {
                    $svc->assertCanAllocate($this->item->fresh(), $date, 1.0);
                    OrderItem::create([
                        'order_id' => Order::create([
                            'order_number' => 'RACE-' . uniqid(),
                            'type' => 'online_pickup',
                            'status' => 'payment_pending',
                            'customer_id' => $this->customer->id,
                            'subtotal' => 25.0,
                            'tax_amount' => 0,
                            'discount_amount' => 0,
                            'total' => 25.0,
                            'fulfil_date' => $date,
                        ])->id,
                        'item_id' => $this->item->id,
                        'item_name' => $this->item->name,
                        'quantity' => 1,
                        'unit_price' => 25.0,
                        'total_price' => 25.0,
                        'status' => 'pending',
                    ]);
                    $wins++;
                });
            } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
                $this->assertSame(422, $e->getStatusCode());
                $this->assertStringContainsString('Only 0 left for collection tomorrow', $e->getMessage());
                $losses++;
            }
        }

        $this->assertSame(1, $wins);
        $this->assertSame(1, $losses);
        $this->assertSame(1, Order::whereDate('fulfil_date', $date)->count());
    }

    public function test_public_menu_exposes_remaining_never_capacity(): void
    {
        $this->seedCommitted(7);

        $res = $this->getJson('/api/items?channel=online_pickup');
        $res->assertOk();
        $row = collect($res->json('data') ?? $res->json('items') ?? [])
            ->firstWhere('id', $this->item->id);
        $this->assertNotNull($row);
        $this->assertSame(3, $row['tomorrow_remaining']);
        $this->assertArrayNotHasKey('tomorrow_daily_capacity', $row);
    }

    public function test_admin_can_set_tomorrow_daily_capacity(): void
    {
        $ownerRole = \App\Models\Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        $owner = \App\Models\User::create([
            'name' => 'Owner',
            'email' => 'owner-capacity@test.com',
            'password' => bcrypt('password'),
            'role_id' => $ownerRole->id,
            'pin_hash' => bcrypt('9999'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        $res = $this->patchJson('/api/items/' . $this->item->id, [
            'tomorrow_daily_capacity' => 12,
        ]);
        $res->assertOk();
        $this->assertSame(12, (int) $this->item->fresh()->tomorrow_daily_capacity);

        $clear = $this->patchJson('/api/items/' . $this->item->id, [
            'tomorrow_daily_capacity' => null,
        ]);
        $clear->assertOk();
        $this->assertNull($this->item->fresh()->tomorrow_daily_capacity);
    }
}
