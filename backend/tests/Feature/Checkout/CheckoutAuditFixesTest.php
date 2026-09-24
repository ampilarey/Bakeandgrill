<?php

declare(strict_types=1);

namespace Tests\Feature\Checkout;

use App\Domains\Ordering\Services\PickupSlotService;
use App\Domains\Orders\Support\SystemCancelReasons;
use App\Domains\Payments\Gateway\BmlConnectService;
use App\Domains\Payments\Services\PaymentService;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Refund;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Checkout audit, 2026-09-26: the unpaid cleanup asks the bank first; a late
 * payment brings the order back or is refunded; order placement is
 * duplicate-proof; unpaid orders hold a slot for 10 minutes; paid orders
 * nobody starts reach the owners; delivery has an optional minimum.
 */
class CheckoutAuditFixesTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $cat = Category::create(['name' => 'Food', 'slug' => 'checkout-audit', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $cat->id, 'name' => 'Mas roshi', 'base_price' => 40.0, 'sku' => 'CA-001',
            'is_active' => true, 'is_available' => true,
        ]);
        $this->customer = Customer::create(['name' => 'Aisha', 'phone' => '+9607771234', 'is_active' => true]);
        $this->makeOwner(['name' => 'Owner', 'phone' => '+9607770001']);

        foreach ([
            'online_ordering_enabled' => '1', 'online_ordering_schedule' => null, 'online_ordering_override_until' => null,
            'delivery_accepting_orders' => '1', 'delivery_schedule' => null, 'delivery_zones' => null,
            'delivery_max_active_orders' => '0', 'delivery_override_until' => null,
        ] as $key => $value) {
            SiteSetting::updateOrCreate(['key' => $key], ['value' => $value, 'type' => 'text', 'group' => 'Test', 'label' => $key, 'is_public' => true]);
        }
        SiteSetting::bust();
        Cache::flush();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function bankSays(string $state, ?string $txn = null): void
    {
        $mock = \Mockery::mock(BmlConnectService::class);
        $expect = $mock->shouldReceive('getTransactionStatus');
        if ($state === 'DOWN') {
            $expect->andThrow(new \RuntimeException('timeout'));
        } else {
            $expect->andReturn(['state' => $state, 'transactionId' => $txn ?? 'TXN-1', 'amount' => 8500]);
        }
        $this->app->instance(BmlConnectService::class, $mock);
    }

    /** @return array{0: Order, 1: Payment} */
    private function unpaidOrder(array $over = [], string $txn = 'TXN-1'): array
    {
        $order = Order::create(array_merge([
            'order_number' => 'ON-' . uniqid(), 'type' => 'online_pickup', 'status' => 'payment_pending', 'payment_status' => 'unpaid',
            'customer_id' => $this->customer->id, 'subtotal' => 85.00, 'tax_amount' => 0, 'discount_amount' => 0, 'total' => 85.00, 'total_laar' => 8500,
        ], $over));
        $payment = Payment::create([
            'order_id' => $order->id, 'method' => 'bml', 'amount' => 85.00, 'amount_laar' => 8500, 'status' => 'pending',
            'local_id' => 'LOCAL-' . $txn, 'provider_transaction_id' => $txn,
        ]);

        return [$order, $payment];
    }

    private function age(Order $order, int $minutes): void
    {
        DB::table('orders')->where('id', $order->id)->update([
            'created_at' => now()->subMinutes($minutes), 'updated_at' => now()->subMinutes($minutes),
        ]);
    }

    public function test_the_unpaid_cleanup_asks_the_bank_before_cancelling(): void
    {
        [$paid] = $this->unpaidOrder([], 'TXN-1');
        $this->age($paid, 40);
        $this->bankSays('CONFIRMED', 'TXN-1');
        $this->artisan('orders:cancel-stale')->assertSuccessful();
        $this->assertSame('pending', $paid->fresh()->status, 'paid at the bank: settled and sent to the kitchen, not cancelled');
        $this->assertNotNull($paid->fresh()->paid_at);

        [$unpaid] = $this->unpaidOrder([], 'TXN-2');
        $this->age($unpaid, 40);
        $this->bankSays('CANCELLED', 'TXN-2');
        $this->artisan('orders:cancel-stale')->assertSuccessful();
        $this->assertSame('cancelled', $unpaid->fresh()->status);
        $this->assertSame(SystemCancelReasons::UNPAID_TIMEOUT, $unpaid->fresh()->cancellation_reason);

        [$unknown] = $this->unpaidOrder([], 'TXN-3');
        $this->age($unknown, 40);
        $this->bankSays('DOWN');
        $this->artisan('orders:cancel-stale')->assertSuccessful();
        $this->assertSame('payment_pending', $unknown->fresh()->status, 'cannot ask the bank: wait');
        $this->age($unknown, 200);
        $this->artisan('orders:cancel-stale')->assertSuccessful();
        $this->assertSame('cancelled', $unknown->fresh()->status, 'after three hours, cancel anyway');
    }

    public function test_a_late_payment_brings_a_recently_cancelled_order_back_to_the_kitchen(): void
    {
        [$order, $payment] = $this->unpaidOrder(['status' => 'cancelled', 'cancellation_reason' => SystemCancelReasons::UNPAID_TIMEOUT, 'cancelled_at' => now()->subMinutes(5)]);
        $this->bankSays('CONFIRMED', 'TXN-1');
        $this->assertTrue(app(\App\Domains\Payments\Services\LatePaymentService::class)->canRevive($order->fresh()));

        app(PaymentService::class)->confirmFromReturnUrl($order->id, 'TXN-1');

        $order->refresh();
        $this->assertSame('pending', $order->status);
        $this->assertSame('paid', $order->payment_status);
        $this->assertNull($order->cancellation_reason);
        $this->assertContains($payment->fresh()->status, ['confirmed', 'paid', 'completed']);
        $this->assertSame(0, Refund::count());
    }

    public function test_a_late_payment_that_cannot_bring_the_order_back_is_refunded_and_the_owner_told(): void
    {
        // Cancelled three hours ago: too late to cook it now.
        [$order, $payment] = $this->unpaidOrder(['status' => 'cancelled', 'cancellation_reason' => SystemCancelReasons::UNPAID_TIMEOUT, 'cancelled_at' => now()->subHours(3)]);
        $this->bankSays('CONFIRMED', 'TXN-1');

        app(PaymentService::class)->confirmFromReturnUrl($order->id, 'TXN-1');
        app(PaymentService::class)->confirmFromReturnUrl($order->id, 'TXN-1'); // a retry changes nothing

        $this->assertSame('cancelled', $order->fresh()->status);
        $this->assertContains($payment->fresh()->status, ['confirmed', 'paid', 'completed']);
        $refunds = Refund::where('order_id', $order->id)->get();
        $this->assertCount(1, $refunds);
        $refund = $refunds->first();
        $this->assertSame('approved', $refund->status);
        $this->assertSame('system', $refund->initiated_by);
        $this->assertSame(8500, (int) $refund->external_tender_laar);
        $this->assertTrue($refund->isOwedExternally(), 'shows under Refunds → Owed');

        $owner = SmsLog::where('type', 'owner_late_payment')->get();
        $this->assertCount(1, $owner);
        $this->assertStringContainsString('Payment of MVR 85.00 for order #' . $order->order_number . ' (Aisha +9607771234) arrived after the order had been cancelled', (string) $owner->first()->message);
        $this->assertSame(1, SmsLog::where('type', 'customer_refund_on_its_way')->where('to', '+9607771234')->count());

        // A cancel by a person is never brought back, even minutes later.
        [$staffCancelled] = $this->unpaidOrder(['status' => 'cancelled', 'cancellation_reason' => 'Customer changed their mind', 'cancelled_at' => now()->subMinute()], 'TXN-9');
        $this->bankSays('CONFIRMED', 'TXN-9');
        app(PaymentService::class)->confirmFromReturnUrl($staffCancelled->id, 'TXN-9');
        $this->assertSame('cancelled', $staffCancelled->fresh()->status);
        $this->assertSame(1, Refund::where('order_id', $staffCancelled->id)->count());
    }

    public function test_placing_the_same_checkout_twice_makes_one_order(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);
        $body = ['type' => 'online_pickup', 'items' => [['item_id' => $this->item->id, 'quantity' => 1]], 'idempotency_key' => 'attempt123'];

        $first = $this->postJson('/api/customer/orders', $body)->assertCreated();
        $again = $this->postJson('/api/customer/orders', $body)->assertOk();
        $this->assertSame($first->json('order.id'), $again->json('order.id'));
        $this->assertSame(1, Order::where('customer_id', $this->customer->id)->count());
        $this->assertSame('web:' . $this->customer->id . ':attempt123', Order::first()->idempotency_key);

        // Another customer with the same key gets their own order.
        $other = Customer::create(['name' => 'Other', 'phone' => '+9607771235', 'is_active' => true]);
        Sanctum::actingAs($other, ['customer']);
        $this->postJson('/api/customer/orders', $body)->assertCreated();
        $this->assertSame(2, Order::count());

        $this->postJson('/api/customer/orders', array_merge($body, ['idempotency_key' => 'bad key!']))->assertStatus(422);
    }

    public function test_an_unpaid_order_holds_its_pickup_slot_for_ten_minutes(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-28 09:00:00'));
        SiteSetting::updateOrCreate(['key' => 'pickup_slot_capacity'], ['value' => '1', 'type' => 'text', 'group' => 'Test', 'label' => 'cap', 'is_public' => false]);
        SiteSetting::updateOrCreate(['key' => 'pickup_slot_minutes'], ['value' => '30', 'type' => 'text', 'group' => 'Test', 'label' => 'min', 'is_public' => false]);
        SiteSetting::bust();
        Cache::flush();
        $slot = Carbon::parse('2026-09-28 12:00:00');
        $available = fn () => collect(app(PickupSlotService::class)->slotsForDate('2026-09-28'))
            ->first(fn ($s) => Carbon::parse($s['starts_at'])->equalTo($slot))['available'] ?? null;

        $this->assertTrue($available());
        [$fresh] = $this->unpaidOrder(['pickup_slot_at' => $slot]);
        $this->assertFalse($available(), 'a checkout in progress holds the place');

        $this->age($fresh, 11);
        $this->assertTrue($available(), 'an abandoned checkout lets it go after 10 minutes');

        $fresh->forceFill(['status' => 'pending', 'payment_status' => 'paid', 'paid_at' => now()])->save();
        $this->age($fresh, 11);
        $this->assertFalse($available(), 'a paid order keeps it');
    }

    public function test_a_paid_pickup_order_nobody_starts_texts_the_owners_once(): void
    {
        $stuck = Order::create([
            'order_number' => 'ST-1', 'type' => 'online_pickup', 'status' => 'pending', 'payment_status' => 'paid', 'paid_at' => now()->subMinutes(15),
            'customer_id' => $this->customer->id, 'subtotal' => 40, 'tax_amount' => 0, 'discount_amount' => 0, 'total' => 40, 'total_laar' => 4000,
        ]);
        // Paid for a pickup in an hour: not late yet.
        Order::create([
            'order_number' => 'ST-2', 'type' => 'online_pickup', 'status' => 'pending', 'payment_status' => 'paid', 'paid_at' => now()->subMinutes(15),
            'pickup_slot_at' => now()->addHour(), 'customer_id' => $this->customer->id, 'subtotal' => 40, 'tax_amount' => 0, 'discount_amount' => 0, 'total' => 40, 'total_laar' => 4000,
        ]);
        // Just paid.
        Order::create([
            'order_number' => 'ST-3', 'type' => 'online_pickup', 'status' => 'pending', 'payment_status' => 'paid', 'paid_at' => now()->subMinutes(2),
            'customer_id' => $this->customer->id, 'subtotal' => 40, 'tax_amount' => 0, 'discount_amount' => 0, 'total' => 40, 'total_laar' => 4000,
        ]);

        $this->artisan('orders:alert-unstarted')->assertSuccessful();
        $this->artisan('orders:alert-unstarted')->assertSuccessful();

        $texts = SmsLog::where('type', 'owner_order_unstarted')->get();
        $this->assertCount(1, $texts);
        $this->assertStringContainsString('Paid online order not started: #ST-1 pickup paid', (string) $texts->first()->message);
        $this->assertStringNotContainsString('ST-2', (string) $texts->first()->message);
        $this->assertNotNull($stuck->fresh()->unstarted_alerted_at);

        SiteSetting::updateOrCreate(['key' => 'ops_unstarted_order_alert_minutes'], ['value' => '0', 'type' => 'text', 'group' => 'Test', 'label' => 'x', 'is_public' => false]);
        SiteSetting::bust();
        Order::whereKey($stuck->id)->update(['unstarted_alerted_at' => null]);
        $this->artisan('orders:alert-unstarted')->assertSuccessful();
        $this->assertSame(1, SmsLog::where('type', 'owner_order_unstarted')->count(), '0 switches it off');
    }

    public function test_delivery_has_an_optional_minimum_order(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);
        $post = fn (int $qty) => $this->postJson('/api/orders/delivery', [
            'items' => [['item_id' => $this->item->id, 'quantity' => $qty]],
            'delivery_address_line1' => 'Kalaafaanu Hingun', 'delivery_island' => 'male',
            'delivery_contact_name' => 'Aisha', 'delivery_contact_phone' => '9607771234',
        ]);

        $post(1)->assertCreated(); // no minimum by default

        SiteSetting::updateOrCreate(['key' => 'delivery_min_order'], ['value' => '100', 'type' => 'text', 'group' => 'Test', 'label' => 'min', 'is_public' => false]);
        SiteSetting::bust();
        $before = Order::count();
        $post(1)->assertStatus(422)->assertJsonFragment(['Delivery orders start at MVR 100.00. Add MVR 60.00 more, or choose pickup.']);
        $this->assertSame($before, Order::count(), 'nothing is kept');
        $post(3)->assertCreated();

        $this->getJson('/api/ordering/delivery-fee-preview?island=male&subtotal_laar=4000')->assertOk()
            ->assertJsonPath('below_minimum', true)->assertJsonPath('short_by_laar', 6000);
        $this->getJson('/api/ordering/delivery-fee-preview?island=male&subtotal_laar=12000')->assertOk()
            ->assertJsonPath('below_minimum', false);
    }
}
