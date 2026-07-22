<?php

declare(strict_types=1);

namespace Tests\Feature\Catering;

use App\Domains\Catering\Events\CateringRequestSubmitted;
use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Models\CateringRequest;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class CateringRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_submit_dispatches_notification_event(): void
    {
        Event::fake([CateringRequestSubmitted::class]);
        SiteSetting::set('catering_min_lead_hours', '24');

        $item = Item::factory()->create();
        ItemChannelAvailability::query()->updateOrCreate(
            ['item_id' => $item->id, 'channel' => 'catering'],
            ['is_enabled' => true],
        );

        $this->postJson('/api/catering-requests', [
            'occasion' => 'event',
            'contact_name' => 'Mariyam',
            'phone' => '7777777',
            'event_date' => now()->addDays(3)->toDateString(),
            'headcount' => 40,
            'interested_items' => [$item->id],
            'notes' => 'Birthday buffet',
        ])
            ->assertCreated()
            ->assertJsonPath('request.id', 1);

        Event::assertDispatched(CateringRequestSubmitted::class);
        $this->assertDatabaseHas('catering_requests', [
            'contact_name' => 'Mariyam',
            'status' => 'new',
            'occasion' => 'event',
        ]);
    }

    public function test_rejects_event_date_inside_lead_time(): void
    {
        SiteSetting::set('catering_min_lead_hours', '48');

        $this->postJson('/api/catering-requests', [
            'occasion' => 'office_breakfast',
            'contact_name' => 'Too Soon',
            'phone' => '7111111',
            'event_date' => now()->addHours(12)->toDateString(),
        ])->assertStatus(422);
    }

    public function test_admin_status_transition_and_quote(): void
    {
        $owner = $this->makeOwner();
        $row = CateringRequest::create([
            'contact_name' => 'Lead',
            'phone' => '7222222',
            'occasion' => 'event',
            'status' => 'new',
        ]);

        $this->actingAs($owner)
            ->patchJson('/api/admin/customers/catering-requests/' . $row->id, [
                'status' => 'quoted',
                'quoted_amount' => 1500,
                'staff_notes' => 'Quoted package A',
            ])
            ->assertOk()
            ->assertJsonPath('request.status', 'quoted')
            ->assertJsonPath('request.quoted_amount', 1500);

        $row->refresh();
        $this->assertNotNull($row->quoted_at);
    }

    public function test_catering_channel_filters_and_never_maps_from_order_type(): void
    {
        $resolver = app(KitchenMenuResolver::class);
        $this->assertSame('online_pickup', $resolver->channelForOrderType('catering'));
        $this->assertContains('catering', KitchenMenuResolver::CHANNELS);
        $this->assertNotContains('catering', KitchenMenuResolver::ORDERING_CHANNELS);

        $on = Item::factory()->create(['is_available' => true, 'is_active' => true]);
        $off = Item::factory()->create(['is_available' => true, 'is_active' => true]);
        ItemChannelAvailability::query()->updateOrCreate(
            ['item_id' => $on->id, 'channel' => 'catering'],
            ['is_enabled' => true],
        );
        ItemChannelAvailability::query()->updateOrCreate(
            ['item_id' => $off->id, 'channel' => 'catering'],
            ['is_enabled' => false],
        );
        foreach (['dine_in', 'takeaway', 'online_pickup', 'delivery'] as $ch) {
            ItemChannelAvailability::query()->updateOrCreate(
                ['item_id' => $on->id, 'channel' => $ch],
                ['is_enabled' => true],
            );
            ItemChannelAvailability::query()->updateOrCreate(
                ['item_id' => $off->id, 'channel' => $ch],
                ['is_enabled' => true],
            );
        }

        $this->assertTrue($resolver->isItemVisibleForChannel($on, 'catering'));
        $this->assertFalse($resolver->isItemVisibleForChannel($off, 'catering'));

        $deliveryIds = collect(
            $this->getJson('/api/items?channel=delivery&available_only=1')->json('data') ?? [],
        )->pluck('id')->all();
        $this->assertContains($on->id, $deliveryIds);

        $cateringIds = collect(
            $this->getJson('/api/items?channel=catering&available_only=1')->json('data') ?? [],
        )->pluck('id')->all();
        $this->assertContains($on->id, $cateringIds);
        $this->assertNotContains($off->id, $cateringIds);
    }
}
