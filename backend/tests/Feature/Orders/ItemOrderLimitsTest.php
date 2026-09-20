<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Models\Category;
use App\Models\CateringRequest;
use App\Models\CateringRequestLine;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\OrderFulfilDateService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

/**
 * The three limits an item carries beside stock.
 *
 * Owner, 2026-09-21: "catering does not require stock, but there might be a
 * limit to order." A platter that only makes sense from ten up, a dish that
 * needs two days' notice, and "most you can make in a day" applied to today
 * and to event dates rather than to collect-tomorrow alone.
 */
class ItemOrderLimitsTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private Item $platter;

    private Customer $customer;

    private User $staff;

    private Device $device;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Platters', 'slug' => 'platters-limits', 'is_active' => true]);

        $this->platter = Item::create([
            'category_id' => $category->id,
            'name' => 'Party Platter',
            'base_price' => 250.0,
            'sku' => 'LIM-PLATTER',
            'is_active' => true,
            'is_available' => true,
            'track_stock' => false,
            'availability_type' => 'made_to_order',
            'allow_pre_order' => true,
        ]);
        foreach (['dine_in', 'takeaway', 'online_pickup', 'delivery', 'catering'] as $channel) {
            ItemChannelAvailability::query()->updateOrCreate(
                ['item_id' => $this->platter->id, 'channel' => $channel],
                ['is_enabled' => true],
            );
        }

        $this->customer = Customer::create(['name' => 'Limits Customer', 'phone' => '+9607770999', 'is_active' => true]);

        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'slug' => 'owner', 'description' => '', 'is_active' => true]);
        $this->staff = User::create([
            'name' => 'Staff', 'email' => 'limits@test.com', 'password' => Hash::make('pw'),
            'role_id' => $role->id, 'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $this->device = Device::create(['name' => 'POS-LIM', 'identifier' => 'POS-LIM-001', 'type' => 'pos', 'is_active' => true]);

        $this->setSetting('online_ordering_enabled', '1');
        $this->setSetting('online_ordering_schedule', null);
        $this->setSetting('online_ordering_override_until', null);
        $this->setSetting(OrderFulfilDateService::SETTING_KEY, '20:00');
        $this->setSetting('catering_ordering_enabled', '1');
        $this->setSetting('catering_min_lead_hours', '24');

        Carbon::setTestNow(Carbon::parse('2026-08-04 15:00:00', config('app.timezone')));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function setSetting(string $key, ?string $value): void
    {
        SiteSetting::updateOrCreate(['key' => $key], [
            'value' => $value, 'type' => 'text', 'group' => 'Test', 'label' => $key, 'is_public' => true,
        ]);
        Cache::forget("site_setting.{$key}");
    }

    private function customerOrder(int $qty, ?string $collectOn = null): \Illuminate\Testing\TestResponse
    {
        Sanctum::actingAs($this->customer, ['customer']);
        $payload = ['type' => 'online_pickup', 'items' => [['item_id' => $this->platter->id, 'quantity' => $qty]]];
        if ($collectOn !== null) {
            $payload['collect_on'] = $collectOn;
        }

        return $this->postJson('/api/customer/orders', $payload);
    }

    private function posOrder(int $qty): \Illuminate\Testing\TestResponse
    {
        $this->ensurePosApiReady($this->staff, $this->device);

        return $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson('/api/orders', ['type' => 'takeaway', 'items' => [['item_id' => $this->platter->id, 'quantity' => $qty]]]);
    }

    private function eventRequest(int $qty, string $eventDate, string $time = '12:00'): \Illuminate\Testing\TestResponse
    {
        Sanctum::actingAs($this->customer, ['customer']);

        return $this->postJson('/api/customer/event-orders', [
            'contact_name' => 'Limits Customer',
            'phone' => '7770999',
            'event_date' => $eventDate,
            'fulfillment_time' => $time,
            'fulfillment_method' => 'pickup',
            'lines' => [['item_id' => $this->platter->id, 'quantity' => $qty]],
        ]);
    }

    /** A standing same-day order placed earlier today, the way the till would have. */
    private function seedToday(int $qty, string $type = 'takeaway'): void
    {
        $order = Order::create([
            'order_number' => 'LIM-' . uniqid(), 'type' => $type, 'status' => 'pending',
            'subtotal' => 250.0 * $qty, 'tax_amount' => 0, 'discount_amount' => 0, 'total' => 250.0 * $qty,
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'item_id' => $this->platter->id, 'item_name' => 'Party Platter',
            'quantity' => $qty, 'unit_price' => 250.0, 'total_price' => 250.0 * $qty, 'status' => 'pending',
        ]);
    }

    /** @return array<string, mixed> */
    private function publicRow(): array
    {
        $row = collect($this->getJson('/api/items?channel=online_pickup&view=customer')->assertOk()->json('data'))
            ->firstWhere('id', $this->platter->id);
        $this->assertNotNull($row);

        return $row;
    }

    // ── Most you can make in a day, today ────────────────────────────────────

    public function test_the_day_cap_counts_todays_orders_from_the_till_against_an_online_order(): void
    {
        $this->platter->update(['tomorrow_daily_capacity' => 5]);
        $this->seedToday(3);

        $row = $this->publicRow();
        $this->assertTrue($row['available_now']);
        $this->assertSame(2, $row['availability']['available_stock']);
        $this->assertTrue($row['is_low_stock']);

        $res = $this->customerOrder(3);
        $res->assertStatus(422);
        $this->assertStringContainsString('Only 2 left for today', (string) $res->getContent());

        $this->customerOrder(2)->assertCreated();

        $row = $this->publicRow();
        $this->assertFalse($row['available_now']);
        $this->assertSame('out_of_stock', $row['unavailable_reason']);
    }

    public function test_the_day_cap_holds_the_till_too_and_a_new_day_starts_fresh(): void
    {
        $this->platter->update(['tomorrow_daily_capacity' => 2]);
        $this->seedToday(2);

        $res = $this->posOrder(1);
        $res->assertStatus(422);
        $this->assertStringContainsString('Only 0 left for today', (string) $res->getContent());

        Carbon::setTestNow(Carbon::parse('2026-08-05 09:00:00', config('app.timezone')));
        $this->posOrder(2)->assertStatus(201);
    }

    public function test_an_event_request_holds_its_date_against_later_requests_and_the_cap_message_names_the_day(): void
    {
        $this->platter->update(['tomorrow_daily_capacity' => 20]);
        $friday = '2026-08-07';

        $this->eventRequest(15, $friday)->assertCreated();

        $res = $this->eventRequest(10, $friday);
        $res->assertStatus(422);
        $this->assertSame('Only 5 left for 7 Aug of Party Platter.', $res->json('errors')['lines.0.quantity'][0]);

        $this->eventRequest(5, $friday)->assertCreated();
        // Another day is untouched.
        $this->eventRequest(20, '2026-08-08')->assertCreated();

        // A cancelled request lets go of its share.
        CateringRequest::query()->whereDate('event_date', $friday)->orderBy('id')->first()->update(['status' => 'cancelled']);
        $cancelledIds = CateringRequest::query()->where('status', 'cancelled')->pluck('id');
        $this->assertSame(15, (int) CateringRequestLine::query()->whereIn('catering_request_id', $cancelledIds)->sum('quantity'));
        $this->eventRequest(15, $friday)->assertCreated();
    }

    // ── Minimum per order ────────────────────────────────────────────────────

    public function test_a_customer_cannot_order_under_the_minimum_but_the_till_can(): void
    {
        $this->platter->update(['min_order_qty' => 10]);

        $this->assertSame(10, $this->publicRow()['min_order_qty']);

        $res = $this->customerOrder(4);
        $res->assertStatus(422);
        $this->assertSame('"Party Platter" is ordered in at least 10.', $res->json('message'));
        $this->customerOrder(10)->assertCreated();

        $event = $this->eventRequest(4, '2026-08-07');
        $event->assertStatus(422)->assertJsonValidationErrors(['lines.0.quantity']);
        $this->assertSame('Party Platter is ordered in at least 10.', $event->json('errors')['lines.0.quantity'][0]);

        $this->posOrder(1)->assertStatus(201);
    }

    // ── Notice ───────────────────────────────────────────────────────────────

    public function test_a_dish_that_needs_notice_is_not_for_today_nor_tomorrow_when_the_notice_runs_past_it(): void
    {
        $this->platter->update(['lead_time_hours' => 48]);

        $row = $this->publicRow();
        $this->assertFalse($row['available_now']);
        $this->assertSame('needs_notice', $row['unavailable_reason']);
        $this->assertSame("Needs 48 hours' notice", $row['availability']['reason_message']);
        $this->assertSame(48, $row['lead_time_hours']);

        $today = $this->customerOrder(1);
        $today->assertStatus(422);
        $this->assertStringContainsString("needs 48 hours' notice", (string) $today->getContent());

        // 15:00 + 48h lands the day after tomorrow, so tomorrow is refused too.
        $this->customerOrder(1, 'tomorrow')->assertStatus(422);

        // The till is not held to the notice.
        $this->posOrder(1)->assertStatus(201);
    }

    public function test_a_short_notice_still_allows_today_while_the_day_has_room(): void
    {
        $this->platter->update(['lead_time_hours' => 3]);

        $this->assertTrue($this->publicRow()['available_now']);
        $this->customerOrder(1)->assertCreated();

        Carbon::setTestNow(Carbon::parse('2026-08-04 22:00:00', config('app.timezone')));
        $this->assertFalse($this->publicRow()['available_now']);
    }

    public function test_the_event_wizard_checks_each_dish_notice_against_the_event_time(): void
    {
        $this->platter->update(['lead_time_hours' => 72]);

        // 24h global lead is met; the dish's own 72h is not (15:00 + 72h = 7 Aug 15:00).
        $res = $this->eventRequest(1, '2026-08-07', '12:00');
        $res->assertStatus(422)->assertJsonValidationErrors(['lines.0.item_id']);
        $this->assertSame("Party Platter needs 72 hours' notice — the earliest is 7 Aug, 15:00.", $res->json('errors.lines\.0\.item_id.0') ?? $res->json('errors')['lines.0.item_id'][0]);

        $this->eventRequest(1, '2026-08-07', '16:00')->assertCreated();
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    public function test_the_owner_sets_all_three_on_the_item(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->patchJson('/api/items/' . $this->platter->id, [
            'tomorrow_daily_capacity' => 12,
            'min_order_qty' => 10,
            'lead_time_hours' => 48,
        ])->assertOk();

        $fresh = $this->platter->fresh();
        $this->assertSame(12, $fresh->tomorrow_daily_capacity);
        $this->assertSame(10, $fresh->min_order_qty);
        $this->assertSame(48, $fresh->lead_time_hours);

        $this->patchJson('/api/items/' . $this->platter->id, ['min_order_qty' => null, 'lead_time_hours' => null])->assertOk();
        $this->assertNull($this->platter->fresh()->min_order_qty);
        $this->assertNull($this->platter->fresh()->lead_time_hours);

        $this->patchJson('/api/items/' . $this->platter->id, ['min_order_qty' => 0])->assertStatus(422);
        $this->patchJson('/api/items/' . $this->platter->id, ['lead_time_hours' => 9000])->assertStatus(422);
    }
}
