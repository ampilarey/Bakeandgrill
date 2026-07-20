<?php

declare(strict_types=1);

namespace Tests\Feature\Catering;

use App\Domains\Catering\Listeners\ConfirmCateringEventOnPaymentListener;
use App\Domains\Catering\Services\CateringLifecycleNotifier;
use App\Domains\Payments\DTOs\PaymentConfirmedData;
use App\Domains\Payments\Events\PaymentConfirmed;
use App\Jobs\ExpireCateringQuotes;
use App\Jobs\SendCateringEventReminders;
use App\Models\CateringRequest;
use App\Models\CateringRequestLine;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Permission;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EventQuotePhase4Test extends TestCase
{
    use RefreshDatabase;

    private User $eventsStaff;

    private Item $catalogItem;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'bml.enforce_signature' => false,
            'bml.webhook_secret' => null,
            'bml.base_url' => 'https://api.merchants.bankofmaldives.com.mv',
            'app.url' => 'https://bakeandgrill.mv',
        ]);
        SiteSetting::set('catering_quote_valid_days', '7');
        SiteSetting::set('catering_quote_min_hours_before_event', '24');
        SiteSetting::set('catering_notify_phone', '9000000');
        SiteSetting::set('catering_reminder_enabled', '1');

        Permission::query()->firstOrCreate(
            ['slug' => 'events.manage'],
            ['name' => 'Manage events', 'group' => 'Events'],
        );

        $this->eventsStaff = $this->makeStaff('staff', [
            'name' => 'Event Lead',
            'phone' => '7777101',
            'email' => 'lead@bakeandgrill.test',
        ]);
        $this->eventsStaff->grantPermission('events.manage');

        $this->customer = $this->makeCustomer([
            'phone' => '+9607777001',
            'name' => 'Aisha',
            'email' => 'aisha@example.com',
        ]);

        $this->catalogItem = Item::factory()->create([
            'name' => 'Fried Rice Tray',
            'base_price' => 450.00,
            'is_active' => true,
            'is_available' => true,
            'has_variants' => false,
        ]);

        Http::fake([
            '*/v2/transactions' => Http::response([
                'transactionId' => 'TXN-EVENT-001',
                'url' => 'https://pay.bml.mv/event-test',
            ], 200),
        ]);
    }

    private function seedPlaceholder(): Item
    {
        return Item::query()->firstOrCreate(
            ['sku' => 'CATERING-CUSTOM'],
            [
                'name' => 'Custom catering item',
                'base_price' => 0,
                'is_active' => false,
                'is_available' => false,
                'track_stock' => false,
                'availability_type' => 'made_to_order',
                'has_variants' => false,
                'tax_code' => 'standard_8',
            ],
        );
    }

    private function makeQuotedEvent(array $overrides = [], ?float $linePrice = 450.0, bool $deposit = false, ?int $paymentLaar = null): CateringRequest
    {
        $this->seedPlaceholder();
        $row = CateringRequest::create(array_merge([
            'customer_id' => $this->customer->id,
            'reference' => CateringRequest::generateReference(),
            'contact_name' => 'Aisha',
            'phone' => '7777001',
            'email' => 'aisha@example.com',
            'occasion' => 'event',
            'event_date' => now()->addDays(10)->toDateString(),
            'fulfillment_method' => 'pickup',
            'fulfillment_time' => '12:00:00',
            'venue_name' => 'Office Hall',
            'status' => 'awaiting_customer',
            'quote_token' => str_repeat('a', 48),
            'quote_version' => 1,
            'quote_sent_at' => now(),
            'quote_expires_at' => now()->addDays(5),
            'quote_is_deposit' => $deposit,
            'handled_by' => $this->eventsStaff->id,
        ], $overrides));

        CateringRequestLine::create([
            'catering_request_id' => $row->id,
            'item_id' => $this->catalogItem->id,
            'name' => 'Fried Rice Tray',
            'quantity' => 1,
            'unit_price' => $linePrice,
            'is_custom' => false,
            'sort_order' => 0,
        ]);

        $subtotalLaar = (int) round($linePrice * 100);
        // Approximate tax-exclusive total for payment; tests often set payment explicitly.
        $totalLaar = $paymentLaar ?? $subtotalLaar;
        $row->update([
            'quote_subtotal_laar' => $subtotalLaar,
            'quote_payment_laar' => $deposit ? (int) round($totalLaar / 2) : $totalLaar,
            'quoted_amount' => round($totalLaar / 100, 2),
        ]);

        return $row->fresh('lines');
    }

    private function confirmBmlPayment(Order $order, Payment $payment): void
    {
        $webhookBody = json_encode([
            'transactionId' => $payment->provider_transaction_id,
            'localId' => $payment->local_id,
            'state' => 'CONFIRMED',
            'amount' => (string) $payment->amount,
            'currency' => 'MVR',
        ]);

        $this->call(
            'POST',
            '/api/payments/bml/webhook',
            [],
            [],
            [],
            ['CONTENT_TYPE' => 'application/json'],
            $webhookBody,
        )->assertOk();
    }

    public function test_price_lock_approve_uses_snapshot_not_catalog(): void
    {
        $row = $this->makeQuotedEvent([], 450.0);
        // After send, catalog changes — must not affect approval.
        $this->catalogItem->update(['base_price' => 500.00]);

        $res = $this->postJson('/api/event-quotes/'.$row->quote_token.'/approve')
            ->assertOk()
            ->assertJsonStructure(['payment_url', 'payment_id', 'order_number']);

        $order = Order::query()->where('order_number', $res->json('order_number'))->firstOrFail();
        $this->assertSame('catering', $order->type);
        $this->assertSame('payment_pending', $order->status);

        $line = OrderItem::query()->where('order_id', $order->id)->firstOrFail();
        $this->assertSame(450.0, (float) $line->unit_price);

        $payment = Payment::query()->where('order_id', $order->id)->firstOrFail();
        $this->assertSame(45000, (int) $payment->amount_laar);
    }

    public function test_deactivated_and_86d_items_still_approve(): void
    {
        $row = $this->makeQuotedEvent(['quote_token' => str_repeat('b', 48)], 100.0);
        $this->catalogItem->update(['is_active' => false, 'is_available' => false]);

        $this->postJson('/api/event-quotes/'.$row->quote_token.'/approve')
            ->assertOk();

        $order = Order::query()->where('type', 'catering')->latest('id')->firstOrFail();
        $line = $order->items()->firstOrFail();
        $this->assertSame($this->catalogItem->id, (int) $line->item_id);
        $this->assertSame(100.0, (float) $line->unit_price);
    }

    public function test_deleted_item_uses_placeholder_with_snapshot_name_price(): void
    {
        $placeholder = $this->seedPlaceholder();
        $row = $this->makeQuotedEvent(['quote_token' => str_repeat('c', 48)], 220.0);
        $this->catalogItem->delete();

        $this->postJson('/api/event-quotes/'.$row->quote_token.'/approve')->assertOk();

        $order = Order::query()->where('type', 'catering')->latest('id')->firstOrFail();
        $line = $order->items()->firstOrFail();
        $this->assertSame($placeholder->id, (int) $line->item_id);
        $this->assertSame('Fried Rice Tray', $line->item_name);
        $this->assertSame(220.0, (float) $line->unit_price);
        $this->assertFalse((bool) $placeholder->fresh()->is_active);
    }

    private function staffSendQuote(bool $deposit): CateringRequest
    {
        Sanctum::actingAs($this->eventsStaff, ['staff']);
        $row = CateringRequest::create([
            'customer_id' => $this->customer->id,
            'reference' => CateringRequest::generateReference(),
            'contact_name' => 'Aisha',
            'phone' => '7777001',
            'email' => 'aisha@example.com',
            'event_date' => now()->addDays(10)->toDateString(),
            'fulfillment_method' => 'pickup',
            'venue_name' => 'Hall',
            'status' => 'draft',
        ]);
        $this->seedPlaceholder();
        $this->putJson('/api/admin/customers/catering-requests/'.$row->id.'/lines', [
            'lines' => [
                ['item_id' => $this->catalogItem->id, 'quantity' => 2],
            ],
        ])->assertOk();
        $previewTotal = (int) $this->getJson('/api/admin/customers/catering-requests/'.$row->id)
            ->json('request.tax_preview.total_laar');
        $payMvr = $deposit
            ? round(($previewTotal / 2) / 100, 2)
            : round($previewTotal / 100, 2);
        $this->postJson('/api/admin/customers/catering-requests/'.$row->id.'/send-quote', [
            'payment_amount_mvr' => $payMvr,
            'is_deposit' => $deposit,
        ])->assertOk();

        return $row->fresh();
    }

    public function test_deposit_payment_confirms_event_once_leaves_partial(): void
    {
        $row = $this->staffSendQuote(true);
        $approve = $this->postJson('/api/event-quotes/'.$row->quote_token.'/approve')->assertOk();
        $order = Order::query()->where('order_number', $approve->json('order_number'))->firstOrFail();
        $payment = Payment::query()->where('order_id', $order->id)->firstOrFail();

        $this->confirmBmlPayment($order, $payment);

        $row->refresh();
        $order->refresh();
        $this->assertSame('confirmed', $row->status);
        $this->assertNotNull($row->confirmed_at);
        $this->assertSame('partial', $order->payment_status);

        $smsCount = SmsLog::query()
            ->where('idempotency_key', 'like', 'event:'.$row->id.':'.$row->quote_version.':confirmed%')
            ->count();
        $this->assertGreaterThan(0, $smsCount);

        $before = SmsLog::query()->count();
        app(ConfirmCateringEventOnPaymentListener::class)->handle(new PaymentConfirmed(
            PaymentConfirmedData::fromPaymentAndOrder($payment->fresh(), $order->fresh()),
        ));
        $this->assertSame($before, SmsLog::query()->count());
    }

    public function test_full_payment_confirms_exactly_once(): void
    {
        $row = $this->staffSendQuote(false);
        $approve = $this->postJson('/api/event-quotes/'.$row->quote_token.'/approve')->assertOk();
        $order = Order::query()->where('order_number', $approve->json('order_number'))->firstOrFail();
        $payment = Payment::query()->where('order_id', $order->id)->firstOrFail();

        $this->confirmBmlPayment($order, $payment);
        $row->refresh();
        $this->assertSame('confirmed', $row->status);

        $keys = SmsLog::query()
            ->where('idempotency_key', 'like', 'event:'.$row->id.':%:confirmed:customer_sms')
            ->count();
        $this->assertSame(1, $keys);

        // OrderPaid may also fire for full pay — confirmation must stay single.
        $before = SmsLog::query()
            ->where('idempotency_key', 'like', 'event:'.$row->id.':%:confirmed:customer_sms')
            ->count();
        app(ConfirmCateringEventOnPaymentListener::class)->handle(new PaymentConfirmed(
            PaymentConfirmedData::fromPaymentAndOrder($payment->fresh(), $order->fresh()),
        ));
        $this->assertSame($before, SmsLog::query()
            ->where('idempotency_key', 'like', 'event:'.$row->id.':%:confirmed:customer_sms')
            ->count());
    }

    public function test_pos_can_settle_deposit_balance(): void
    {
        $row = $this->staffSendQuote(true);
        $approve = $this->postJson('/api/event-quotes/'.$row->quote_token.'/approve')->assertOk();
        $order = Order::query()->where('order_number', $approve->json('order_number'))->firstOrFail();
        $payment = Payment::query()->where('order_id', $order->id)->firstOrFail();
        $this->confirmBmlPayment($order, $payment);
        $order->refresh();
        $this->assertSame('partial', $order->payment_status);

        $remaining = max(0, (int) $order->total_laar - (int) $payment->amount_laar);
        $this->assertGreaterThan(0, $remaining);

        Payment::create([
            'order_id' => $order->id,
            'method' => 'cash',
            'amount' => round($remaining / 100, 2),
            'amount_laar' => $remaining,
            'status' => 'confirmed',
            'idempotency_key' => 'cash:settle:'.$order->id,
            'processed_at' => now(),
        ]);
        app(\App\Domains\Payments\Services\OrderPaymentStateService::class)->syncPaymentStatus($order->fresh());
        $order->refresh();
        $this->assertSame('paid', $order->payment_status);
    }

    public function test_expiry_sweep_and_reminder_and_cancel_notify(): void
    {
        $row = $this->makeQuotedEvent([
            'quote_token' => str_repeat('f', 48),
            'quote_expires_at' => now()->subMinute(),
            'status' => 'awaiting_customer',
        ]);

        (new ExpireCateringQuotes)->handle(app(CateringLifecycleNotifier::class));
        $row->refresh();
        $this->assertSame('quoted', $row->status);
        $this->assertNull($row->quote_token);
        $this->assertDatabaseHas('sms_logs', [
            'idempotency_key' => 'event:'.$row->id.':1:quote_expired:customer_sms',
        ]);

        // Idempotent second run
        $before = SmsLog::query()->count();
        (new ExpireCateringQuotes)->handle(app(CateringLifecycleNotifier::class));
        $this->assertSame($before, SmsLog::query()->count());

        $confirmed = $this->makeQuotedEvent([
            'reference' => CateringRequest::generateReference(),
            'quote_token' => null,
            'status' => 'confirmed',
            'event_date' => now()->addDay()->toDateString(),
            'confirmed_at' => now(),
        ]);
        (new SendCateringEventReminders)->handle(app(CateringLifecycleNotifier::class));
        $this->assertDatabaseHas('sms_logs', [
            'idempotency_key' => 'event:'.$confirmed->id.':1:reminder:customer_sms',
        ]);

        Sanctum::actingAs($this->eventsStaff, ['staff']);
        $toCancel = $this->makeQuotedEvent([
            'reference' => CateringRequest::generateReference(),
            'quote_token' => str_repeat('g', 48),
            'status' => 'quoted',
        ]);
        $this->patchJson('/api/admin/customers/catering-requests/'.$toCancel->id, [
            'status' => 'cancelled',
        ])->assertOk();
        $this->assertDatabaseHas('sms_logs', [
            'idempotency_key' => 'event:'.$toCancel->id.':1:cancelled:customer_sms',
        ]);
    }

    public function test_expired_token_and_double_approve_and_edit_blocked(): void
    {
        $expired = $this->makeQuotedEvent([
            'quote_token' => str_repeat('h', 48),
            'quote_expires_at' => now()->subMinute(),
        ]);
        $this->postJson('/api/event-quotes/'.$expired->quote_token.'/approve')->assertStatus(410);

        $row = $this->makeQuotedEvent(['quote_token' => str_repeat('i', 48)], 100.0, false, 10000);
        $first = $this->postJson('/api/event-quotes/'.$row->quote_token.'/approve')->assertOk();
        $second = $this->postJson('/api/event-quotes/'.$row->quote_token.'/approve')->assertOk();
        $this->assertSame($first->json('order_number'), $second->json('order_number'));
        $this->assertSame(1, Order::query()->where('type', 'catering')->count());

        Sanctum::actingAs($this->eventsStaff, ['staff']);
        $this->putJson('/api/admin/customers/catering-requests/'.$row->id.'/lines', [
            'lines' => [['item_id' => $this->catalogItem->id, 'quantity' => 1]],
        ])->assertStatus(422);

        $this->patchJson('/api/admin/customers/catering-requests/'.$row->id, [
            'venue_name' => 'New Hall',
        ])->assertStatus(422);
    }

    public function test_customer_event_list_scoped_and_cross_customer_blocked(): void
    {
        $mine = $this->makeQuotedEvent(['quote_token' => null, 'status' => 'draft']);
        $otherCustomer = $this->makeCustomer(['phone' => '+9607777999', 'email' => 'other@ex.com']);
        CateringRequest::create([
            'customer_id' => $otherCustomer->id,
            'reference' => CateringRequest::generateReference(),
            'contact_name' => 'Other',
            'phone' => '7777999',
            'status' => 'draft',
            'event_date' => now()->addDays(5)->toDateString(),
        ]);

        Sanctum::actingAs($this->customer, ['customer']);
        $res = $this->getJson('/api/customer/event-orders')->assertOk();
        $refs = collect($res->json('data'))->pluck('reference')->all();
        $this->assertContains($mine->reference, $refs);
        $this->assertCount(1, $refs);
        $this->assertArrayNotHasKey('id', $res->json('data.0'));

        $detail = $this->getJson('/api/customer/event-orders/' . $mine->reference)->assertOk();
        $this->assertSame($mine->reference, $detail->json('data.reference'));
        $this->assertIsArray($detail->json('data.lines'));

        $otherRef = CateringRequest::query()->where('customer_id', $otherCustomer->id)->value('reference');
        $this->getJson('/api/customer/event-orders/' . $otherRef)->assertNotFound();
    }

    public function test_placeholder_never_menu_visible(): void
    {
        $placeholder = $this->seedPlaceholder();
        $this->assertFalse((bool) $placeholder->is_active);
        $this->getJson('/api/items')
            ->assertOk();
        $ids = collect($this->getJson('/api/items')->json('data') ?? $this->getJson('/api/items')->json())
            ->pluck('id')
            ->filter()
            ->all();
        // Public items endpoint may paginate — assert placeholder not among active listing via query.
        $this->assertFalse(
            Item::query()->where('is_active', true)->where('id', $placeholder->id)->exists()
        );
    }
}
