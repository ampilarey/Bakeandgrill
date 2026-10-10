<?php

declare(strict_types=1);

namespace Tests\Feature\Notifications;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\Services\PaymentConfirmationNotifier;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Domains\Orders\DTOs\OrderCreatedData;
use App\Domains\Orders\DTOs\OrderStatusChangedData;
use App\Domains\Orders\Events\OrderCreated;
use App\Domains\Orders\Events\OrderStatusChanged;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Mail\OrderConfirmationMail;
use App\Models\CateringRequest;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Role;
use App\Models\Shift;
use App\Models\SiteSetting;
use App\Models\StaffNotificationPref;
use App\Models\User;
use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

/**
 * Owner, 2026-10-10: "Fix" the duplicates the audit found. One event sends
 * one message to each person: the payment confirmation email once, one
 * text at delivery with the receipt in it, one text when a refund starts,
 * the event confirmation alone when a catering quote is paid, one staff
 * alert per till sale, one alert per late delivery.
 */
class OneMessagePerEventTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<array{to: string, text: string}> */
    private array $texts = [];

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $provider = Mockery::mock(SmsProviderInterface::class);
        $provider->shouldReceive('send')->andReturnUsing(function (string $to, string $text) {
            $this->texts[] = ['to' => $to, 'text' => $text];

            return [true, ['ok' => true], null];
        });
        $this->app->instance(SmsProviderInterface::class, $provider);
        config(['bml.enforce_signature' => false, 'bml.webhook_secret' => null, 'app.url' => 'https://bakeandgrill.mv', 'frontend.order_status_url' => '']);
    }

    /** @return list<string> */
    private function textsTo(string $phone): array
    {
        return array_values(array_map(fn (array $t) => $t['text'], array_filter($this->texts, fn (array $t) => $t['to'] === $phone)));
    }

    private function confirmationEmails(): int
    {
        return Mail::sent(OrderConfirmationMail::class)->count() + Mail::queued(OrderConfirmationMail::class)->count();
    }

    private function statusChanged(Order $order, string $status): void
    {
        $order->update(['status' => $status]);
        DeferAfterResponse::flushTestingCallbacks();
        event(new OrderStatusChanged(new OrderStatusChangedData(orderId: $order->id, status: $status, customerId: $order->customer_id, orderNumber: (string) $order->order_number, updatedAt: now()->toIso8601String())));
        DeferAfterResponse::flushTestingCallbacks();
    }

    // ── Payment confirmation email ─────────────────────────────────────

    public function test_an_online_card_payment_sends_one_confirmation_email(): void
    {
        $customer = Customer::create(['name' => 'Online Customer', 'phone' => '+9607991234', 'email' => 'buyer@example.com']);
        $order = Order::create([
            'order_number' => 'ON-9001', 'type' => 'online_pickup', 'status' => 'payment_pending', 'payment_status' => 'unpaid',
            'customer_id' => $customer->id, 'subtotal' => 50, 'tax_amount' => 0, 'discount_amount' => 0, 'total' => 50, 'total_laar' => 5000,
        ]);
        $payment = Payment::create([
            'order_id' => $order->id, 'method' => 'bml_connect', 'amount' => 50, 'amount_laar' => 5000, 'status' => 'initiated',
            'idempotency_key' => 'bml:init:' . $order->id . ':t', 'local_id' => 'LOCAL-1', 'provider_transaction_id' => 'TXN-1',
        ]);

        $this->call('POST', '/api/payments/bml/webhook', [], [], [], ['CONTENT_TYPE' => 'application/json'], (string) json_encode([
            'transactionId' => 'TXN-1', 'localId' => $payment->local_id, 'state' => 'CONFIRMED', 'amount' => '50.00', 'currency' => 'MVR',
        ]))->assertOk();
        DeferAfterResponse::flushTestingCallbacks();

        $this->assertCount(1, $this->textsTo('+9607991234'), 'one text');
        $this->assertSame(1, $this->confirmationEmails(), 'one email: it went three times');
    }

    public function test_the_confirmation_email_goes_once_however_many_paths_announce_the_payment(): void
    {
        $customer = Customer::create(['name' => 'Counter Customer', 'phone' => '+9607991236', 'email' => 'counter@example.com']);
        $order = Order::factory()->paid()->create(['customer_id' => $customer->id, 'type' => 'takeaway', 'total' => 20, 'total_laar' => 2000]);

        // Zero-balance and card paths call it, then "order paid" calls it again.
        app(PaymentConfirmationNotifier::class)->notify($order->fresh());
        app(PaymentConfirmationNotifier::class)->notify($order->fresh());

        $this->assertSame(1, $this->confirmationEmails());
    }

    // ── Delivery: one text with the receipt ────────────────────────────

    private function deliveryOrder(string $status = 'on_the_way'): Order
    {
        $customer = Customer::create(['name' => 'Delivery Customer', 'phone' => '+9607991235']);

        return Order::create([
            'order_number' => 'DL-1', 'type' => 'delivery', 'status' => $status, 'payment_status' => 'paid', 'paid_at' => now(),
            'customer_id' => $customer->id, 'subtotal' => 50, 'tax_amount' => 0, 'discount_amount' => 0, 'total' => 50, 'total_laar' => 5000,
        ]);
    }

    public function test_delivered_is_one_text_that_carries_the_receipt(): void
    {
        $order = $this->deliveryOrder();

        $this->statusChanged($order, 'delivered');
        $this->statusChanged($order, 'completed');

        $texts = $this->textsTo('+9607991235');
        $this->assertCount(1, $texts, 'one text at delivery, none at completion');
        $this->assertStringContainsString('has been delivered', $texts[0]);
        $this->assertStringContainsString('/receipts/', $texts[0], 'the receipt link is in the delivered text');
    }

    public function test_a_delivery_completed_without_a_delivered_step_still_gets_its_receipt(): void
    {
        $order = $this->deliveryOrder();

        $this->statusChanged($order, 'completed');

        $texts = $this->textsTo('+9607991235');
        $this->assertCount(1, $texts);
        $this->assertStringContainsString('/receipts/', $texts[0]);
    }

    public function test_with_the_delivered_message_off_the_receipt_still_goes_at_delivery(): void
    {
        SiteSetting::set('sms_customer_delivered_enabled', 'false');
        SmsTypeRegistry::setEmailEnabled('customer_order_delivered', false);
        $order = $this->deliveryOrder();

        $this->statusChanged($order, 'delivered');

        $texts = $this->textsTo('+9607991235');
        $this->assertCount(1, $texts);
        $this->assertStringContainsString('complete. Receipt', $texts[0]);
    }

    // ── Refunds: one text when a refund starts ─────────────────────────

    /** @return array{0: Order, 1: User, 2: User} */
    private function refundSetup(): array
    {
        $roles = [];
        foreach (['staff' => 'Staff', 'owner' => 'Owner'] as $slug => $name) {
            $roles[$slug] = Role::firstOrCreate(['slug' => $slug], ['name' => $name, 'is_active' => true]);
        }
        PermissionCatalogSync::sync();
        $cashier = User::factory()->create(['role_id' => $roles['staff']->id, 'phone' => '+9607001001', 'is_active' => true]);
        $owner = User::factory()->create(['role_id' => $roles['owner']->id, 'phone' => '+9607001003', 'is_active' => true]);
        $customer = Customer::create(['name' => 'Refund Cust', 'phone' => '+9607778888', 'is_active' => true]);
        $order = Order::factory()->paid()->create(['customer_id' => $customer->id, 'delivery_contact_phone' => '+9607778888', 'total' => 50, 'total_laar' => 5000, 'status' => 'paid', 'payment_status' => 'paid']);
        Payment::create(['order_id' => $order->id, 'method' => 'cash', 'amount' => 50, 'amount_laar' => 5000, 'status' => 'confirmed']);
        foreach ([$cashier, $owner] as $u) {
            $device = Device::create(['identifier' => 'REF-ONE-' . $u->id, 'name' => 'Till ' . $u->id, 'type' => 'pos', 'is_active' => true, 'status' => 'approved']);
            Shift::create(['user_id' => $u->id, 'device_id' => $device->id, 'opened_at' => now(), 'opening_cash' => 100]);
        }

        return [$order->fresh(), $cashier, $owner];
    }

    public function test_a_refund_started_by_a_cashier_sends_the_customer_only_the_code(): void
    {
        [$order, $cashier] = $this->refundSetup();
        Sanctum::actingAs($cashier, ['staff']);

        $this->postJson("/api/orders/{$order->id}/refunds", ['amount' => 50, 'reason_category' => 'order_cancelled', 'reason' => 'Customer left'])->assertCreated();

        $texts = $this->textsTo('+9607778888');
        $this->assertCount(1, $texts, '"refund requested" and the code came together');
        $this->assertStringContainsString('confirms a refund', $texts[0]);
    }

    public function test_an_owner_refund_in_one_step_sends_only_processed(): void
    {
        [$order, , $owner] = $this->refundSetup();
        Sanctum::actingAs($owner, ['staff']);

        $this->postJson("/api/orders/{$order->id}/refunds", ['amount' => 50, 'reason_category' => 'order_cancelled', 'reason' => 'Customer left'])->assertCreated();

        $texts = $this->textsTo('+9607778888');
        $this->assertCount(1, $texts, '"requested" and "processed" came together');
        $this->assertStringContainsString('has been processed', $texts[0]);
    }

    // ── Catering: the event confirmation covers the payment ────────────

    private function cateringOrder(int $quotePaymentLaar, array $paymentsLaar): Order
    {
        $customer = Customer::create(['name' => 'Aisha', 'phone' => '+9607777001', 'email' => 'aisha@example.com']);
        $order = Order::create([
            'order_number' => 'CT-1', 'type' => 'catering', 'status' => 'paid', 'payment_status' => 'paid', 'paid_at' => now(),
            'customer_id' => $customer->id, 'subtotal' => 100, 'tax_amount' => 0, 'discount_amount' => 0, 'total' => 100, 'total_laar' => 10000,
        ]);
        foreach ($paymentsLaar as $i => $laar) {
            Payment::create(['order_id' => $order->id, 'method' => $i === 0 ? 'bml_connect' : 'cash', 'amount' => $laar / 100, 'amount_laar' => $laar, 'status' => 'confirmed', 'idempotency_key' => "ct:{$i}"]);
        }
        CateringRequest::create([
            'customer_id' => $customer->id, 'reference' => 'EV-ONE', 'contact_name' => 'Aisha', 'phone' => '7777001', 'email' => 'aisha@example.com',
            'event_date' => now()->addDays(10)->toDateString(), 'fulfillment_method' => 'pickup', 'status' => 'confirmed', 'confirmed_at' => now(),
            'pos_order_id' => $order->id, 'quote_payment_laar' => $quotePaymentLaar,
        ]);

        return $order->fresh();
    }

    public function test_a_catering_quote_paid_in_full_gets_no_extra_receipt_text_or_email(): void
    {
        $order = $this->cateringOrder(10000, [10000]);

        app(PaymentConfirmationNotifier::class)->notify($order);

        $this->assertSame([], $this->textsTo('+9607777001'), 'the event confirmation already says it is paid');
        $this->assertSame(0, $this->confirmationEmails());
    }

    public function test_a_catering_balance_paid_later_gets_its_receipt(): void
    {
        $order = $this->cateringOrder(5000, [5000, 5000]); // deposit online, balance at the till

        app(PaymentConfirmationNotifier::class)->notify($order);

        $this->assertCount(1, $this->textsTo('+9607777001'));
        $this->assertSame(1, $this->confirmationEmails());
    }

    // ── Staff: one alert per till sale ─────────────────────────────────

    private function fallbackStaff(): User
    {
        $role = Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'is_active' => true]);
        PermissionCatalogSync::sync();
        $staff = User::factory()->create(['role_id' => $role->id, 'phone' => '+9607500005', 'is_active' => true, 'name' => 'Ali']);
        StaffNotificationPref::create(['user_id' => $staff->id, 'is_fallback' => true, 'fallback_priority' => 10]);

        return $staff;
    }

    private function tillSale(string $type = 'takeaway'): Order
    {
        $order = Order::create(['order_number' => 'TK-1', 'type' => $type, 'status' => 'pending', 'subtotal' => 30, 'tax_amount' => 0, 'discount_amount' => 0, 'total' => 30, 'total_laar' => 3000]);
        event(new OrderCreated(OrderCreatedData::fromOrder($order)));
        DeferAfterResponse::flushTestingCallbacks();

        return $order;
    }

    public function test_a_takeaway_rung_up_and_paid_sends_staff_one_alert(): void
    {
        $this->fallbackStaff();

        $order = $this->tillSale();
        $this->statusChanged($order, 'paid');
        $this->statusChanged($order, 'in_progress');

        $this->assertCount(1, $this->textsTo('+9607500005'), '"new order" then "order confirmed" seconds apart');
        $this->assertSame('skipped', \App\Models\StaffNotificationLog::query()->where('event_type', 'order_confirmed')->value('status'));
    }

    public function test_with_new_order_switched_off_order_confirmed_is_the_one_alert(): void
    {
        $this->fallbackStaff();
        SiteSetting::set('staff_sms_new_order_enabled', '0');
        SmsTypeRegistry::setEmailEnabled('staff_new_order', false);
        SmsTypeRegistry::setTelegramEnabled('staff_new_order', false);

        $order = $this->tillSale();
        $this->statusChanged($order, 'paid');

        $texts = $this->textsTo('+9607500005');
        $this->assertCount(1, $texts);
        $this->assertStringContainsString('confirmed', $texts[0]);
    }

    // ── Late deliveries: once per order ────────────────────────────────

    public function test_a_late_delivery_is_reported_once_and_a_new_one_again(): void
    {
        SiteSetting::set('business_phone', '+960 912 0011');
        SiteSetting::set('sms_owner_delivery_delays_enabled', 'true'); // off until the owner turns it on
        SiteSetting::bust();
        Carbon::setTestNow('2026-10-10 14:50:00');
        $late = Order::create(['order_number' => 'DL-LATE-1', 'type' => 'delivery', 'status' => 'on_the_way', 'delivery_eta_at' => now()->subMinutes(30), 'subtotal' => 10, 'tax_amount' => 0, 'discount_amount' => 0, 'total' => 10, 'total_laar' => 1000]);

        Artisan::call('ops:alert-delivery-delays');
        Carbon::setTestNow('2026-10-10 15:05:00'); // a new hour: it used to text again
        Artisan::call('ops:alert-delivery-delays');

        $texts = $this->textsTo('+9609120011');
        $this->assertCount(1, $texts);
        $this->assertStringContainsString('#DL-LATE-1', $texts[0]);
        $this->assertNotNull($late->fresh()->delay_alerted_at);

        Order::create(['order_number' => 'DL-LATE-2', 'type' => 'delivery', 'status' => 'on_the_way', 'delivery_eta_at' => now()->subMinutes(20), 'subtotal' => 10, 'tax_amount' => 0, 'discount_amount' => 0, 'total' => 10, 'total_laar' => 1000]);
        Artisan::call('ops:alert-delivery-delays');

        $texts = $this->textsTo('+9609120011');
        $this->assertCount(2, $texts, 'a newly late order is reported');
        $this->assertStringContainsString('#DL-LATE-2', $texts[1]);
        $this->assertStringNotContainsString('#DL-LATE-1', $texts[1]);
        Carbon::setTestNow();
    }
}
