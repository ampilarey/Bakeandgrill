<?php

declare(strict_types=1);

namespace Tests\Feature\Catering;

use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Models\CateringRequest;
use App\Models\CateringRequestLine;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Models\ItemPackagingOption;
use App\Models\Order;
use App\Models\Permission;
use App\Models\SiteSetting;
use App\Models\User;
use App\Models\Variant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Phase 2/4 follow-up: catering listing channel, variant + packaging fidelity.
 */
class EventWizardFidelityTest extends TestCase
{
    use RefreshDatabase;

    private User $eventsStaff;

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
        SiteSetting::set('catering_min_lead_hours', '24');
        SiteSetting::set('catering_quote_valid_days', '7');
        SiteSetting::set('catering_quote_min_hours_before_event', '24');
        SiteSetting::set('packaging_fee_taxable', '1');

        Permission::query()->firstOrCreate(
            ['slug' => 'events.manage'],
            ['name' => 'Manage events', 'group' => 'Events'],
        );
        $this->eventsStaff = $this->makeStaff('staff', ['name' => 'Event Lead']);
        $this->eventsStaff->grantPermission('events.manage');

        $this->customer = $this->makeCustomer([
            'phone' => '+9607777001',
            'name' => 'Aisha',
            'email' => 'aisha@example.com',
        ]);

        Item::query()->firstOrCreate(
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

        Http::fake([
            '*/v2/transactions' => Http::response([
                'transactionId' => 'TXN-FIDELITY',
                'url' => 'https://pay.bml.mv/fidelity',
            ], 200),
        ]);
    }

    private function enableChannels(Item $item, array $channels): void
    {
        foreach (KitchenMenuResolver::CHANNELS as $ch) {
            ItemChannelAvailability::query()->updateOrCreate(
                ['item_id' => $item->id, 'channel' => $ch],
                ['is_enabled' => in_array($ch, $channels, true)],
            );
        }
    }

    public function test_catering_only_item_listed_on_catering_channel_but_not_immediate(): void
    {
        $buffet = Item::factory()->create([
            'name' => 'Buffet Package',
            'base_price' => 1200,
            'is_active' => true,
            'is_available' => true,
            'has_variants' => false,
            'packaging_fee_mode' => 'per_line',
        ]);
        $this->enableChannels($buffet, ['catering']);

        $opt = ItemPackagingOption::create([
            'item_id' => $buffet->id,
            'name' => 'Chafing tray',
            'fee' => 25,
            'is_default' => true,
            'is_active' => true,
            'sort_order' => 0,
        ]);

        $cateringList = $this->getJson('/api/items?channel=catering&available_only=1')
            ->assertOk()
            ->json('data');
        $row = collect($cateringList)->firstWhere('id', $buffet->id);
        $this->assertNotNull($row);
        $this->assertTrue($row['is_catering']);
        $this->assertSame('per_line', $row['packaging_fee_mode']);
        $this->assertNotEmpty($row['packaging_options']);
        $this->assertSame($opt->id, $row['packaging_options'][0]['id']);

        foreach (['takeaway', 'online_pickup', 'delivery', 'dine_in'] as $ch) {
            $ids = collect($this->getJson('/api/items?channel='.$ch.'&available_only=1')->json('data') ?? [])
                ->pluck('id');
            $this->assertFalse($ids->contains($buffet->id), "catering-only must not appear on {$ch}");
        }

        $this->assertNotContains('catering', KitchenMenuResolver::ORDERING_CHANNELS);
        $resolver = app(KitchenMenuResolver::class);
        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        $resolver->assertLineItemsAllowedForOrderType(
            [$buffet->id => $buffet],
            [['item_id' => $buffet->id]],
            'takeaway',
        );
    }

    public function test_variant_required_and_packaging_persisted_on_event_draft(): void
    {
        $item = Item::factory()->create([
            'name' => 'Tray Set',
            'base_price' => 100,
            'is_active' => true,
            'has_variants' => true,
            'packaging_fee_mode' => 'per_unit',
        ]);
        $this->enableChannels($item, ['catering', 'online_pickup']);
        $large = Variant::create([
            'item_id' => $item->id,
            'name' => 'Large',
            'price' => 180,
            'is_active' => true,
            'sort_order' => 0,
        ]);
        $premium = ItemPackagingOption::create([
            'item_id' => $item->id,
            'name' => 'Premium box',
            'fee' => 8,
            'is_default' => false,
            'is_active' => true,
            'sort_order' => 1,
        ]);
        ItemPackagingOption::create([
            'item_id' => $item->id,
            'name' => 'Standard',
            'fee' => 3,
            'is_default' => true,
            'is_active' => true,
            'sort_order' => 0,
        ]);
        $foreign = ItemPackagingOption::create([
            'item_id' => Item::factory()->create()->id,
            'name' => 'Other item pack',
            'fee' => 1,
            'is_default' => true,
            'is_active' => true,
            'sort_order' => 0,
        ]);

        Sanctum::actingAs($this->customer, ['customer']);
        $base = [
            'contact_name' => 'Aisha',
            'phone' => '7777001',
            'event_date' => now()->addDays(5)->toDateString(),
            'fulfillment_time' => '12:00',
            'fulfillment_method' => 'pickup',
        ];

        $this->postJson('/api/customer/event-orders', array_merge($base, [
            'lines' => [['item_id' => $item->id, 'quantity' => 2]],
        ]))->assertStatus(422)->assertJsonValidationErrors(['lines.0.variant_id']);

        $this->postJson('/api/customer/event-orders', array_merge($base, [
            'lines' => [[
                'item_id' => $item->id,
                'variant_id' => $large->id,
                'packaging_option_id' => $foreign->id,
                'quantity' => 2,
            ]],
        ]))->assertStatus(422);

        $ok = $this->postJson('/api/customer/event-orders', array_merge($base, [
            'lines' => [[
                'item_id' => $item->id,
                'variant_id' => $large->id,
                'packaging_option_id' => $premium->id,
                'quantity' => 2,
            ]],
        ]))->assertCreated();

        $lineId = $ok->json('request.lines.0.id');
        $line = CateringRequestLine::findOrFail($lineId);
        $this->assertSame($large->id, (int) $line->variant_id);
        $this->assertSame($premium->id, (int) $line->packaging_option_id);
        $this->assertSame(180.0, (float) $line->unit_price);
        $this->assertStringContainsString('Large', (string) $line->name);
    }

    public function test_quote_packaging_matches_approval_order_total_and_duplicate_copies_option(): void
    {
        $item = Item::factory()->create([
            'name' => 'Office Platter',
            'base_price' => 200,
            'is_active' => true,
            'is_available' => true,
            'has_variants' => false,
            'packaging_fee_mode' => 'per_unit',
            'tax_code' => 'standard_8',
        ]);
        $this->enableChannels($item, ['catering']);
        $box = ItemPackagingOption::create([
            'item_id' => $item->id,
            'name' => 'Insulated box',
            'fee' => 10,
            'is_default' => true,
            'is_active' => true,
            'sort_order' => 0,
        ]);

        $row = CateringRequest::create([
            'customer_id' => $this->customer->id,
            'reference' => CateringRequest::generateReference(),
            'contact_name' => 'Aisha',
            'phone' => '7777001',
            'email' => 'aisha@example.com',
            'event_date' => now()->addDays(8)->toDateString(),
            'fulfillment_method' => 'pickup',
            'status' => 'draft',
            'source' => 'event_wizard',
            'quote_version' => 1,
        ]);
        CateringRequestLine::create([
            'catering_request_id' => $row->id,
            'item_id' => $item->id,
            'packaging_option_id' => $box->id,
            'name' => 'Office Platter',
            'quantity' => 3,
            'unit_price' => 200.00,
            'is_custom' => false,
            'sort_order' => 0,
        ]);

        Sanctum::actingAs($this->eventsStaff, ['staff']);
        $show = $this->getJson('/api/admin/customers/catering-requests/'.$row->id)
            ->assertOk();
        $preview = $show->json('request.tax_preview');
        $this->assertSame(60000, $preview['subtotal_laar']); // 200×3
        $this->assertSame(3000, $preview['packaging_fee_laar']); // 10×3 per_unit
        $this->assertGreaterThan(0, $preview['total_laar']);

        $send = $this->postJson('/api/admin/customers/catering-requests/'.$row->id.'/send-quote', [
            'payment_amount_mvr' => $preview['total_laar'] / 100,
            'is_deposit' => false,
        ])->assertOk();
        $token = $row->fresh()->quote_token;
        $this->assertNotEmpty($token);
        $this->assertStringContainsString($token, (string) $send->json('request.quote_url'));

        $public = $this->getJson('/api/event-quotes/'.$token)->assertOk()->json('quote');
        $this->assertSame($preview['packaging_fee_laar'], $public['packaging_fee_laar']);
        $this->assertSame($preview['total_laar'], $public['total_laar']);

        $approve = $this->postJson('/api/event-quotes/'.$token.'/approve')->assertOk();
        $order = Order::query()->where('order_number', $approve->json('order_number'))->firstOrFail();
        $orderItem = $order->items()->first();
        $this->assertSame($box->id, (int) $orderItem->packaging_option_id);
        $this->assertEquals(10.0, (float) $orderItem->packaging_fee);
        $this->assertSame((int) $public['total_laar'], (int) $order->total_laar);
        $this->assertSame((int) $public['packaging_fee_laar'], (int) $order->packaging_fee_laar);

        $dup = $this->postJson('/api/admin/customers/catering-requests/'.$row->id.'/duplicate')
            ->assertCreated()
            ->json('request');
        $this->assertSame($box->id, (int) $dup['lines'][0]['packaging_option_id']);
    }

    public function test_staff_can_change_packaging_option_on_lines(): void
    {
        $item = Item::factory()->create([
            'name' => 'Tray',
            'base_price' => 50,
            'is_active' => true,
            'packaging_fee_mode' => 'per_line',
        ]);
        $a = ItemPackagingOption::create([
            'item_id' => $item->id,
            'name' => 'A',
            'fee' => 5,
            'is_default' => true,
            'is_active' => true,
            'sort_order' => 0,
        ]);
        $b = ItemPackagingOption::create([
            'item_id' => $item->id,
            'name' => 'B',
            'fee' => 12,
            'is_default' => false,
            'is_active' => true,
            'sort_order' => 1,
        ]);

        $row = CateringRequest::create([
            'reference' => CateringRequest::generateReference(),
            'contact_name' => 'Aisha',
            'phone' => '7777001',
            'event_date' => now()->addDays(6)->toDateString(),
            'fulfillment_method' => 'pickup',
            'status' => 'draft',
            'source' => 'admin',
            'quote_version' => 1,
        ]);

        Sanctum::actingAs($this->eventsStaff, ['staff']);
        $res = $this->putJson('/api/admin/customers/catering-requests/'.$row->id.'/lines', [
            'lines' => [[
                'item_id' => $item->id,
                'quantity' => 2,
                'packaging_option_id' => $b->id,
            ]],
        ])->assertOk();

        $this->assertSame($b->id, (int) $res->json('request.lines.0.packaging_option_id'));
        $this->assertSame('B', $res->json('request.lines.0.packaging_option_name'));
        // per_line: fee once regardless of qty 2
        $this->assertSame(1200, $res->json('request.tax_preview.packaging_fee_laar'));
        $this->assertNotEquals($a->id, (int) $res->json('request.lines.0.packaging_option_id'));
    }
}
