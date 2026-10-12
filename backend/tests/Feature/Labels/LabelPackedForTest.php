<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\CateringRequest;
use App\Models\CateringRequestLine;
use App\Models\Customer;
use App\Models\Item;
use App\Models\LabelJob;
use App\Models\LabelPrint;
use App\Models\SiteSetting;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use App\Models\TradeDeliveryLine;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Packed-for stickers (2026-10-12): who the packs are for, on every design,
 * filled in from a wholesale delivery or a catering event.
 */
class LabelPackedForTest extends TestCase
{
    use RefreshDatabase;

    private Item $bajiya;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        CarbonImmutable::setTestNow('2026-10-12 09:00:00');
        SiteSetting::set('business_phone', '+960 912 0011');
        Cache::flush();
        $this->bajiya = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true, 'label_shelf_life_days' => 90, 'label_ingredients_source' => 'manual', 'label_ingredients' => 'Flour, salt']);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    private function sheet(array $body): string
    {
        $res = $this->postJson('/api/labels/stickers/url', $body)->assertOk();

        return (string) $this->get($res->json('view_url'))->assertOk()->getContent();
    }

    public function test_packed_for_prints_on_every_design_and_the_saved_label_keeps_it(): void
    {
        $body = ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'for' => 'NH Kuda Rah', 'for2' => 'Delivery TD-LBL-1 · Tue, 14 Oct 2026'];
        $full = $this->sheet($body + ['layout' => 'a4-4']);
        $this->assertStringContainsString('P A C K E D   F O R', $full);
        $this->assertStringContainsString('>NH Kuda Rah</div>', $full);
        $this->assertStringContainsString('Delivery TD-LBL-1 · Tue, 14 Oct 2026', $full);

        $compact = $this->sheet($body + ['layout' => 'a4-8']);
        $this->assertStringContainsString('PACKED FOR: NH Kuda Rah · Delivery TD-LBL-1 · Tue, 14 Oct 2026', $compact);
        $small = $this->sheet($body + ['layout' => 'single-custom', 'w' => 40, 'h' => 60]);
        $this->assertStringContainsString('PACKED FOR: NH Kuda Rah</div>', $small, 'the 40 mm label keeps the name and drops the second part');
        $this->assertStringNotContainsString('NH Kuda Rah · Delivery', $small);
        $wide = $this->sheet($body + ['layout' => 'single-custom', 'w' => 80, 'h' => 50]);
        $this->assertStringContainsString('PACKED FOR: NH Kuda Rah · Delivery TD-LBL-1', $wide);

        $job = LabelJob::query()->latest('id')->firstOrFail();
        $this->assertSame('NH Kuda Rah', $job->request['for']);
        $this->assertSame(['for' => 'NH Kuda Rah', 'for2' => 'Delivery TD-LBL-1 · Tue, 14 Oct 2026'], LabelPrint::query()->latest('id')->value('details'));
        $this->postJson("/api/labels/jobs/{$job->id}/print")->assertOk();
        $this->assertStringContainsString('NH Kuda Rah', (string) $this->get($this->postJson("/api/labels/jobs/{$job->id}/print")->json('view_url'))->getContent());
    }

    public function test_a_wholesale_delivery_and_a_catering_event_fill_the_form(): void
    {
        $customer = Customer::factory()->create();
        $account = TradeAccount::create(['customer_id' => $customer->id, 'shop_name' => 'NH Kuda Rah', 'contact_name' => 'Adam', 'contact_phone' => '+960 911 9368', 'is_active' => true, 'missing_policy' => TradeAccount::MISSING_CHARGE]);
        $delivery = TradeDelivery::create(['trade_account_id' => $account->id, 'delivery_number' => 'TD-LBL-1', 'status' => TradeDelivery::STATUS_DISPATCHED, 'dispatched_at' => '2026-10-14 08:00:00', 'idempotency_key' => 'lbl-1']);
        $patties = $this->makeItem(false, 0, ['name' => 'Patties']);
        TradeDeliveryLine::create(['trade_delivery_id' => $delivery->id, 'item_id' => $this->bajiya->id, 'qty_sent' => 40, 'unit_price_laar' => 500, 'unit_cost_laar' => 250]);
        TradeDeliveryLine::create(['trade_delivery_id' => $delivery->id, 'item_id' => $patties->id, 'qty_sent' => 25, 'unit_price_laar' => 500, 'unit_cost_laar' => 250]);

        $this->getJson("/api/labels/deliveries/{$delivery->id}/stickers")->assertOk()
            ->assertJsonPath('data.for', 'NH Kuda Rah')
            ->assertJsonPath('data.for2', 'Delivery TD-LBL-1 · Wed, 14 Oct 2026')
            ->assertJsonPath('data.items.0.name', 'Bajiya')
            ->assertJsonPath('data.items.0.copies', 40)
            ->assertJsonPath('data.items.0.label_enabled', true)
            ->assertJsonPath('data.items.1.copies', 25)
            ->assertJsonPath('data.items.1.label_enabled', false);

        $event = CateringRequest::create([
            'customer_id' => $customer->id, 'reference' => 'CR-2026-0042', 'contact_name' => 'Aisha', 'company' => 'Ooredoo', 'phone' => '7777001',
            'occasion' => 'office party', 'event_date' => '2026-10-20', 'fulfillment_method' => 'pickup', 'status' => 'awaiting_customer',
        ]);
        CateringRequestLine::create(['catering_request_id' => $event->id, 'item_id' => $this->bajiya->id, 'name' => 'Bajiya', 'quantity' => 60, 'unit_price' => 3.5, 'is_custom' => false, 'sort_order' => 0]);
        CateringRequestLine::create(['catering_request_id' => $event->id, 'item_id' => null, 'name' => 'Custom cake', 'quantity' => 1, 'unit_price' => 300, 'is_custom' => true, 'sort_order' => 1]);
        $this->getJson("/api/labels/catering/{$event->id}/stickers")->assertOk()
            ->assertJsonPath('data.for', 'Ooredoo')
            ->assertJsonPath('data.for2', 'CR-2026-0042 · Office party · Tue, 20 Oct 2026')
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.copies', 60);

        Sanctum::actingAs($this->makeStaff(), ['staff']);
        $this->getJson("/api/labels/deliveries/{$delivery->id}/stickers")->assertForbidden();
        $this->getJson("/api/labels/catering/{$event->id}/stickers")->assertForbidden();
    }
}
