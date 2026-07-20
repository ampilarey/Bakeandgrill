<?php

declare(strict_types=1);

namespace Tests\Feature\Catering;

use App\Domains\Catering\Events\CateringRequestSubmitted;
use App\Domains\Catering\Services\CateringEventCreatedNotifier;
use App\Mail\CustomerOtpMail;
use App\Mail\EventRequestReceivedMail;
use App\Models\CateringRequest;
use App\Models\CateringRequestLine;
use App\Models\Customer;
use App\Models\Item;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EventOrderDraftTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private Item $catalogItem;

    protected function setUp(): void
    {
        parent::setUp();
        SiteSetting::set('catering_min_lead_hours', '24');
        SiteSetting::set('catering_notify_phone', '9111111');
        SiteSetting::set('catering_notify_email', 'events@bakeandgrill.test');
        $this->customer = $this->makeCustomer([
            'phone' => '+9607777001',
            'name' => 'Aisha',
            'email' => 'aisha@example.com',
        ]);
        $this->catalogItem = Item::factory()->create([
            'name' => 'Party Tray',
            'base_price' => 450.00,
            'is_active' => true,
            'has_variants' => false,
        ]);
    }

    public function test_authenticated_customer_creates_draft_with_mixed_lines_server_prices(): void
    {
        Event::fake([CateringRequestSubmitted::class]);
        Sanctum::actingAs($this->customer, ['customer']);

        $res = $this->postJson('/api/customer/event-orders', [
            'event_date' => now()->addDays(4)->toDateString(),
            'fulfillment_time' => '12:00',
            'lines' => [
                [
                    'item_id' => $this->catalogItem->id,
                    'quantity' => 2,
                    'unit_price' => 1.00, // must be rejected
                ],
                [
                    'custom_name' => 'Extra chutney bowls',
                    'quantity' => 3,
                    'notes' => 'Mild',
                ],
            ],
        ]);

        $res->assertStatus(422); // unit_price prohibited

        $res = $this->postJson('/api/customer/event-orders', [
            'event_date' => now()->addDays(4)->toDateString(),
            'fulfillment_time' => '12:00',
            'lines' => [
                ['item_id' => $this->catalogItem->id, 'quantity' => 2],
                ['custom_name' => 'Extra chutney bowls', 'quantity' => 3, 'notes' => 'Mild'],
            ],
        ]);

        $res->assertCreated()
            ->assertJsonPath('request.status', 'draft')
            ->assertJsonPath('request.lines.0.unit_price', 450)
            ->assertJsonPath('request.lines.1.unit_price', null)
            ->assertJsonPath('request.lines.1.is_custom', true);

        $ref = $res->json('request.reference');
        $this->assertMatchesRegularExpression('/^EV-\d{8}-[A-Z0-9]{4,}$/', (string) $ref);

        $this->assertDatabaseHas('catering_requests', [
            'customer_id' => $this->customer->id,
            'reference' => $ref,
            'status' => 'draft',
            'contact_name' => 'Aisha',
            'phone' => '+9607777001',
            'fulfillment_method' => 'pickup',
        ]);

        $this->assertSame(2, CateringRequestLine::query()->count());
        Event::assertDispatched(CateringRequestSubmitted::class);
    }

    public function test_minimal_wizard_payload_fills_contact_from_customer(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);

        $this->postJson('/api/customer/event-orders', [
            'event_date' => now()->addDays(4)->toDateString(),
            'fulfillment_time' => '12:00',
            'lines' => [['item_id' => $this->catalogItem->id, 'quantity' => 1]],
        ])
            ->assertCreated()
            ->assertJsonPath('request.fulfillment_method', 'pickup');

        $this->assertDatabaseHas('catering_requests', [
            'customer_id' => $this->customer->id,
            'contact_name' => 'Aisha',
            'phone' => '+9607777001',
            'fulfillment_method' => 'pickup',
        ]);
    }

    public function test_lead_time_validation_and_delivery_requires_address(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);
        SiteSetting::set('catering_min_lead_hours', '48');

        $this->postJson('/api/customer/event-orders', [
            'contact_name' => 'Aisha',
            'phone' => '7777001',
            'event_date' => now()->addHours(12)->toDateString(),
            'fulfillment_time' => '12:00',
            'fulfillment_method' => 'pickup',
            'lines' => [['item_id' => $this->catalogItem->id, 'quantity' => 1]],
        ])->assertStatus(422);

        $this->postJson('/api/customer/event-orders', [
            'contact_name' => 'Aisha',
            'phone' => '7777001',
            'event_date' => now()->addDays(5)->toDateString(),
            'fulfillment_time' => '12:00',
            'fulfillment_method' => 'delivery',
            'lines' => [['item_id' => $this->catalogItem->id, 'quantity' => 1]],
        ])->assertStatus(422);

        $this->postJson('/api/customer/event-orders', [
            'contact_name' => 'Aisha',
            'phone' => '7777001',
            'event_date' => now()->addDays(5)->toDateString(),
            'fulfillment_time' => '12:00',
            'fulfillment_method' => 'delivery',
            'delivery_address' => 'H. Sahara',
            'delivery_island' => 'Malé',
            'lines' => [['item_id' => $this->catalogItem->id, 'quantity' => 1]],
        ])->assertCreated();
    }

    public function test_reference_numbers_are_unique(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);
        $refs = [];
        for ($i = 0; $i < 3; $i++) {
            $refs[] = $this->postJson('/api/customer/event-orders', [
                'contact_name' => 'Aisha',
                'phone' => '7777001',
                'event_date' => now()->addDays(5)->toDateString(),
                'fulfillment_time' => '12:00',
                'fulfillment_method' => 'pickup',
                'lines' => [['custom_name' => "Custom {$i}", 'quantity' => 1]],
            ])->assertCreated()->json('request.reference');
        }
        $this->assertSame(count($refs), count(array_unique($refs)));
    }

    public function test_created_notifications_dispatch_idempotently(): void
    {
        Mail::fake();
        Sanctum::actingAs($this->customer, ['customer']);

        $res = $this->postJson('/api/customer/event-orders', [
            'contact_name' => 'Aisha',
            'phone' => '7777001',
            'email' => 'aisha@example.com',
            'event_date' => now()->addDays(5)->toDateString(),
            'fulfillment_time' => '12:00',
            'fulfillment_method' => 'pickup',
            'lines' => [['item_id' => $this->catalogItem->id, 'quantity' => 1]],
        ])->assertCreated();

        $id = (int) $res->json('request.id');
        $row = CateringRequest::query()->findOrFail($id);

        // Sync notify from EventOrderController::store
        $customerSms = SmsLog::query()
            ->where('idempotency_key', 'event:' . $id . ':1:created:customer_sms')
            ->first();
        $this->assertNotNull($customerSms);
        $this->assertStringContainsString('View details:', (string) $customerSms->message);
        $this->assertStringContainsString('/order/events/mine/' . $row->reference, (string) $customerSms->message);

        $staffSms = SmsLog::query()
            ->where('idempotency_key', 'event:' . $id . ':1:created:staff_sms:0')
            ->first();
        $this->assertNotNull($staffSms);
        $this->assertStringContainsString('/admin/catering/' . $id, (string) $staffSms->message);

        // Second notify must not duplicate SMS rows.
        app(CateringEventCreatedNotifier::class)->notify($row);
        app(CateringEventCreatedNotifier::class)->notify($row);

        Mail::assertSent(EventRequestReceivedMail::class);

        $this->assertSame(1, SmsLog::query()
            ->where('idempotency_key', 'event:' . $id . ':1:created:customer_sms')
            ->count());
    }

    public function test_authenticated_customers_skip_otp_for_event_orders(): void
    {
        // Creating an event order with Sanctum customer auth must succeed without OTP.
        Sanctum::actingAs($this->customer, ['customer']);

        $this->postJson('/api/customer/event-orders', [
            'contact_name' => 'Aisha',
            'phone' => '7777001',
            'event_date' => now()->addDays(5)->toDateString(),
            'fulfillment_time' => '12:00',
            'fulfillment_method' => 'pickup',
            'lines' => [['custom_name' => 'Tray', 'quantity' => 1]],
        ])->assertCreated();

        // Unauthenticated callers cannot create drafts.
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/customer/event-orders', [
            'contact_name' => 'Guest',
            'phone' => '7777002',
            'event_date' => now()->addDays(5)->toDateString(),
            'fulfillment_time' => '12:00',
            'fulfillment_method' => 'pickup',
            'lines' => [['custom_name' => 'Tray', 'quantity' => 1]],
        ])->assertUnauthorized();
    }

    public function test_email_otp_channel_and_sms_default(): void
    {
        Mail::fake();

        $this->postJson('/api/auth/customer/otp/request', [
            'phone' => '7777003',
            'purpose' => 'register',
        ])->assertOk()->assertJsonPath('channel', 'sms');

        Mail::assertNothingSent();

        $this->postJson('/api/auth/customer/otp/request', [
            'phone' => '7777003',
            'purpose' => 'register',
            'channel' => 'email',
        ])->assertStatus(422);

        $this->postJson('/api/auth/customer/otp/request', [
            'phone' => '7777003',
            'purpose' => 'register',
            'channel' => 'email',
            'email' => 'new@example.com',
        ])->assertOk()->assertJsonPath('channel', 'email');

        Mail::assertSent(CustomerOtpMail::class);
    }

    public function test_pre_order_confirmation_idor_is_gone(): void
    {
        $this->get('/pre-order/1/confirmation')->assertNotFound();
    }

    public function test_legacy_corporate_alias_still_accepts(): void
    {
        Event::fake([CateringRequestSubmitted::class]);

        $this->postJson('/api/corporate-inquiries', [
            'contact_name' => 'Corp',
            'phone' => '7666666',
            'event_date' => now()->addDays(5)->toDateString(),
            'fulfillment_time' => '12:00',
            'notes' => 'Legacy client',
        ])->assertCreated();

        Event::assertDispatched(CateringRequestSubmitted::class);
    }

    public function test_admin_show_includes_lines_and_draft_in_list(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);
        $created = $this->postJson('/api/customer/event-orders', [
            'contact_name' => 'Aisha',
            'phone' => '7777001',
            'event_date' => now()->addDays(5)->toDateString(),
            'fulfillment_time' => '12:00',
            'fulfillment_method' => 'pickup',
            'lines' => [
                ['item_id' => $this->catalogItem->id, 'quantity' => 1],
                ['custom_name' => 'Extra', 'quantity' => 2],
            ],
        ])->assertCreated();

        $id = (int) $created->json('request.id');
        $owner = $this->makeOwner();

        $this->actingAs($owner)
            ->getJson('/api/admin/customers/catering-requests?status=draft')
            ->assertOk()
            ->assertJsonPath('data.0.id', $id)
            ->assertJsonPath('data.0.lines_count', 2)
            ->assertJsonPath('data.0.custom_lines_count', 1);

        $this->actingAs($owner)
            ->getJson('/api/admin/customers/catering-requests/' . $id)
            ->assertOk()
            ->assertJsonCount(2, 'request.lines');
    }
}
