<?php

declare(strict_types=1);

namespace Tests\Feature\Audit;

use App\Domains\Payments\Gateway\BmlConnectService;
use App\Domains\Payments\Services\PaymentService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use App\Models\CustomerErasureRequest;
use App\Models\GstSetting;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Refund;
use App\Models\User;
use App\Models\WebhookLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\Helpers\ModelHelpers;
use Tests\TestCase;

/**
 * Code audit, 2026-10-19. The cases that do not already live beside
 * an older test: guest pay, tracking privacy, erasure, unsigned
 * webhooks, Blade OTP, the tax-invoice page, and the shelf GST note.
 */
class CodeAuditFindingsTest extends TestCase
{
    use ModelHelpers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    public function test_a_tracking_link_hides_delivery_details_unless_the_owner_is_signed_in(): void
    {
        $owner = Customer::create(['name' => 'Aisha', 'phone' => '+9607771111', 'is_active' => true]);
        $other = Customer::create(['name' => 'Other', 'phone' => '+9607772222', 'is_active' => true]);
        $order = $this->deliveryOrder($owner);

        $guest = $this->getJson('/api/orders/track/' . $order->tracking_token)->assertOk();
        $guest->assertJsonPath('order.delivery_contact_name', null);
        $guest->assertJsonPath('order.delivery_contact_phone', null);
        $guest->assertJsonPath('order.delivery_address_line1', null);
        $guest->assertJsonPath('order.remaining_balance_laar', 10000);
        $this->assertStringNotContainsString('Maaveyo', $guest->getContent());
        $this->assertStringNotContainsString('7771111', $guest->getContent());

        $this->actingAs($owner, 'customer')
            ->getJson('/api/orders/track/' . $order->tracking_token)
            ->assertOk()
            ->assertJsonPath('order.delivery_contact_name', 'Aisha')
            ->assertJsonPath('order.delivery_contact_phone', '7771111')
            ->assertJsonPath('order.delivery_address_line1', 'Maaveyo Magu 12');

        $this->app['auth']->forgetGuards();
        $this->actingAs($other, 'customer')
            ->getJson('/api/orders/track/' . $order->tracking_token)
            ->assertOk()
            ->assertJsonPath('order.delivery_contact_phone', null);
    }

    public function test_a_guest_with_the_tracking_link_can_pay_the_remaining_balance(): void
    {
        $order = $this->deliveryOrder(Customer::create([
            'name' => 'Aisha', 'phone' => '+9607773333', 'is_active' => true,
        ]));
        $this->mockBml();

        $this->postJson('/api/orders/track/' . $order->tracking_token . '/pay')
            ->assertOk()
            ->assertJsonPath('payment_url', 'https://bml.example/pay/TXN-TRACK-1');

        $this->assertSame('payment_pending', $order->fresh()->status);
        $this->assertSame(1, Payment::where('order_id', $order->id)->count());

        $order->update(['status' => 'paid', 'payment_status' => 'paid']);
        $this->postJson('/api/orders/track/' . $order->tracking_token . '/pay')->assertStatus(422);
    }

    public function test_a_customer_can_ask_to_be_erased_and_an_owner_completes_it(): void
    {
        $customer = Customer::create(['name' => 'Aisha', 'phone' => '+9607774444', 'is_active' => true, 'email' => 'aisha@example.mv']);
        Sanctum::actingAs($customer, ['customer']);

        $this->postJson('/api/customer/erasure-request')->assertCreated();
        $this->postJson('/api/customer/erasure-request')->assertOk();
        $this->assertSame(1, CustomerErasureRequest::where('customer_id', $customer->id)->where('status', 'pending')->count());

        $this->app['auth']->forgetGuards();
        $owner = $this->makeOwner();
        $this->getJson('/api/admin/customers/' . $customer->id, $this->staffHeaders($owner))
            ->assertOk()
            ->assertJsonPath('customer.erasure_requested', true);

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/admin/customers/' . $customer->id . '/erase', [], $this->staffHeaders($owner))->assertOk();

        $row = CustomerErasureRequest::where('customer_id', $customer->id)->firstOrFail();
        $this->assertSame('completed', $row->status);
        $this->assertSame($owner->id, (int) $row->completed_by);
        $this->assertNotNull($row->completed_at);
    }

    public function test_an_unsigned_webhook_is_rejected_outside_the_test_harness(): void
    {
        config(['bml.enforce_signature' => false, 'bml.webhook_secret' => null]);
        $this->app->detectEnvironment(static fn (): string => 'local');

        $payment = $this->openPayment();
        $body = json_encode([
            'transactionId' => $payment->provider_transaction_id,
            'localId' => $payment->local_id,
            'state' => 'CONFIRMED',
            'amount' => '100.00',
            'currency' => 'MVR',
        ], JSON_THROW_ON_ERROR);

        $res = $this->call('POST', '/api/payments/bml/webhook', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
        ], $body);

        $this->assertSame(503, $res->status());
        $this->assertSame('initiated', $payment->fresh()->status);
        $this->assertSame(0, WebhookLog::count());
    }

    public function test_a_payment_closed_because_the_bill_changed_is_recorded_and_the_extra_is_owed_back(): void
    {
        config(['bml.enforce_signature' => false, 'bml.webhook_secret' => null]);

        $order = Order::create([
            'order_number' => 'BML-OVER-1',
            'type' => 'online_pickup',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'subtotal' => 80,
            'total' => 80,
            'total_laar' => 8000,
        ]);
        $payment = Payment::create([
            'idempotency_key' => 'bml:over:' . $order->id,
            'order_id' => $order->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'currency' => 'MVR',
            'amount' => 100,
            'amount_laar' => 10000,
            'local_id' => 'BGOVER0001',
            'provider_transaction_id' => 'TXN-OVER-1',
            'status' => 'cancelled',
            'gateway_response' => ['closed' => 'due_changed'],
            'processed_at' => now(),
        ]);

        $body = json_encode([
            'transactionId' => 'TXN-OVER-1',
            'localId' => 'BGOVER0001',
            'state' => 'CONFIRMED',
            'amount' => '100.00',
            'currency' => 'MVR',
        ], JSON_THROW_ON_ERROR);
        app(PaymentService::class)->handleBmlWebhook($body, []);
        app(PaymentService::class)->handleBmlWebhook($body, []);

        $this->assertSame('confirmed', $payment->fresh()->status);
        $refunds = Refund::where('order_id', $order->id)->get();
        $this->assertCount(1, $refunds);
        $this->assertSame('approved', $refunds->first()->status);
        $this->assertSame('duplicate_charge', $refunds->first()->reason_category);
        $this->assertSame(20.0, (float) $refunds->first()->amount);
        $this->assertSame(2000, (int) $refunds->first()->external_tender_laar);
    }

    public function test_the_website_shows_an_otp_only_in_the_local_harness(): void
    {
        config(['system.otp_dev_return' => true]);
        $this->from('/customer/login')
            ->post('/customer/request-otp', ['phone' => '7775555'])
            ->assertRedirect()
            ->assertSessionHas('otp_hint');

        config(['system.otp_dev_return' => false]);
        $this->from('/customer/login')
            ->post('/customer/request-otp', ['phone' => '7775556'])
            ->assertRedirect()
            ->assertSessionMissing('otp_hint');

        config([
            'system.otp_dev_return' => true,
            'services.dhiraagu.username' => null,
            'services.dhiraagu.password' => null,
            'services.dhiraagu.api_url' => null,
        ]);
        $this->app->detectEnvironment(static fn (): string => 'production');
        // Production is no longer the PHPUnit harness, so the form needs its token.
        $this->startSession();
        $this->from('/customer/login')
            ->post('/customer/request-otp', ['phone' => '7775557', '_token' => csrf_token()])
            ->assertRedirect()
            ->assertSessionMissing('otp_hint');
    }

    public function test_password_reset_otp_verify_stops_after_five_tries(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->from('/customer/forgot-password')
                ->post('/customer/verify-reset-otp', ['phone' => '7776666', 'otp' => '000000'])
                ->assertRedirect()
                ->assertSessionHasErrors('otp');
        }

        $this->from('/customer/forgot-password')
            ->post('/customer/verify-reset-otp', ['phone' => '7776666', 'otp' => '000000'])
            ->assertRedirect()
            ->assertSessionHasErrors(['otp' => 'Too many attempts. Try again in 10 minutes.']);
    }

    public function test_a_tax_invoice_page_names_itself_and_shows_the_tin(): void
    {
        GstSetting::query()->updateOrCreate(['id' => 1], [
            'gst_registered' => true,
            'seller_name' => 'Bake & Grill Pvt Ltd',
            'seller_address' => 'Male',
            'seller_tin' => '1234567',
            'tax_inclusive' => false,
            'default_tax_rate_bp' => 800,
        ]);
        $owner = User::factory()->create();
        $tax = Invoice::create([
            'invoice_number' => 'INV-TAX-1',
            'type' => 'sale',
            'status' => 'sent',
            'is_tax_invoice' => true,
            'created_by' => $owner->id,
            'subtotal_laar' => 10000,
            'tax_laar' => 800,
            'discount_laar' => 0,
            'total_laar' => 10800,
            'amount_paid_laar' => 0,
            'subtotal' => 100,
            'tax_amount' => 8,
            'discount_amount' => 0,
            'total' => 108,
            'issue_date' => now()->toDateString(),
        ]);

        $this->get('/invoices/' . $tax->token)
            ->assertOk()
            ->assertSee('Tax Invoice', false)
            ->assertSee('data-seller-tin', false)
            ->assertSee('TIN: 1234567', false)
            ->assertSee('>GST<', false);

        $plain = Invoice::create([
            'invoice_number' => 'INV-PLAIN-1',
            'type' => 'sale',
            'status' => 'sent',
            'is_tax_invoice' => false,
            'created_by' => $owner->id,
            'subtotal_laar' => 10000,
            'tax_laar' => 0,
            'discount_laar' => 0,
            'total_laar' => 10000,
            'amount_paid_laar' => 0,
            'subtotal' => 100,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 100,
            'issue_date' => now()->toDateString(),
        ]);

        $this->get('/invoices/' . $plain->token)
            ->assertOk()
            ->assertDontSee('Tax Invoice', false)
            ->assertDontSee('data-seller-tin', false);
    }

    public function test_menu_prices_say_gst_is_added_only_when_it_is_exclusive(): void
    {
        $this->assertSame('', \App\Support\GstShelfNote::text());
        $html = view('partials.card-price', ['sale' => 12.5])->render();
        $this->assertStringNotContainsString('price-gst-note', $html);

        GstSetting::query()->updateOrCreate(['id' => 1], [
            'gst_registered' => true,
            'tax_inclusive' => true,
            'default_tax_rate_bp' => 800,
        ]);
        $this->flushRequest();
        $this->assertSame('', \App\Support\GstShelfNote::text());

        GstSetting::query()->updateOrCreate(['id' => 1], [
            'gst_registered' => true,
            'tax_inclusive' => false,
        ]);
        // A new request, so the shelf note is read again.
        $this->flushRequest();
        $this->assertSame('GST added at checkout', \App\Support\GstShelfNote::text());
        $noted = view('partials.card-price', ['sale' => 12.5])->render();
        $this->assertStringContainsString('GST added at checkout', $noted);
    }

    public function test_the_order_app_is_not_a_second_home_for_search_engines(): void
    {
        $robots = (string) $this->get('https://bakeandgrill.mv/robots.txt')->assertOk()->getContent();
        $this->assertStringContainsString('Disallow: /order/', $robots);
        $this->assertStringNotContainsString("Disallow: /\n", $robots);

        $this->get('https://bakeandgrill.mv/order/menu')
            ->assertOk()
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow')
            ->assertSee('noindex, nofollow', false)
            ->assertSee('rel="canonical" href="https://bakeandgrill.mv/"', false)
            ->assertDontSee('application/ld+json', false);

        $this->assertStringContainsString('Disallow: /', (string) file_get_contents(public_path('order/robots.txt')));
        $sitemap = (string) file_get_contents(public_path('order/sitemap.xml'));
        $this->assertStringNotContainsString('<url>', $sitemap);
    }

    private function deliveryOrder(Customer $customer): Order
    {
        return Order::create([
            'order_number' => 'TRK-' . $customer->id,
            'tracking_token' => 'tracktoken' . $customer->id . 'abcdefghij',
            'customer_id' => $customer->id,
            'type' => 'delivery',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'subtotal' => 100,
            'total' => 100,
            'total_laar' => 10000,
            'delivery_address_line1' => 'Maaveyo Magu 12',
            'delivery_island' => 'Male',
            'delivery_contact_name' => 'Aisha',
            'delivery_contact_phone' => '7771111',
        ]);
    }

    private function mockBml(): void
    {
        $mock = Mockery::mock(BmlConnectService::class);
        $mock->shouldReceive('normalizeLocalId')->andReturnUsing(
            fn (string $id) => substr(preg_replace('/[^A-Za-z0-9]/', '', $id) ?? $id, 0, 50),
        );
        $mock->shouldReceive('createPayment')->andReturn([
            'transaction_id' => 'TXN-TRACK-1',
            'payment_url' => 'https://bml.example/pay/TXN-TRACK-1',
            'local_id' => 'TRACK1',
        ]);
        $this->app->instance(BmlConnectService::class, $mock);
    }

    private function openPayment(): Payment
    {
        $order = Order::create([
            'order_number' => 'BML-UNSIGN-1',
            'type' => 'online_pickup',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'subtotal' => 100,
            'total' => 100,
            'total_laar' => 10000,
        ]);

        return Payment::create([
            'idempotency_key' => 'bml:unsign:' . $order->id,
            'order_id' => $order->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'currency' => 'MVR',
            'amount' => 100,
            'amount_laar' => 10000,
            'local_id' => 'BGUNSIGN01',
            'provider_transaction_id' => 'TXN-UNSIGN-1',
            'status' => 'initiated',
            'processed_at' => now(),
        ]);
    }

    /** Drop the shelf-note cache by starting a fresh request. */
    private function flushRequest(): void
    {
        $this->app->instance('request', \Illuminate\Http\Request::create('/'));
    }
}
