<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Models\InventoryItem;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\Supplier;
use App\Models\SupplierPriceHistory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

/**
 * Owner, 2026-09-21: a Monday SMS of what went up, without opening the app.
 */
class PriceRiseAlertTest extends TestCase
{
    use RefreshDatabase;

    private function price(InventoryItem $item, Supplier $s, float $price, int $daysAgo): void
    {
        SupplierPriceHistory::create([
            'supplier_id' => $s->id,
            'inventory_item_id' => $item->id,
            'unit_price' => $price,
            'unit' => $item->unit,
            'recorded_at' => now()->subDays($daysAgo)->toDateString(),
        ]);
    }

    public function test_it_texts_the_owner_the_items_up_ten_percent_or_more(): void
    {
        $this->makeOwner(['phone' => '9607771234']);
        SiteSetting::set('ops_price_rise_alert_sms', '1');
        $agora = Supplier::create(['name' => 'Agora']);
        $flour = InventoryItem::create(['name' => 'Flour', 'unit' => 'kg', 'unit_cost' => 12, 'is_active' => true]);
        $eggs = InventoryItem::create(['name' => 'Eggs', 'unit' => 'pcs', 'unit_cost' => 2, 'is_active' => true]);
        $oil = InventoryItem::create(['name' => 'Oil', 'unit' => 'l', 'unit_cost' => 30, 'is_active' => true]);
        $this->price($flour, $agora, 10, 20);
        $this->price($flour, $agora, 12, 2);   // +20%
        $this->price($eggs, $agora, 2, 20);
        $this->price($eggs, $agora, 2.1, 2);   // +5%, not worth a text
        $this->price($oil, $agora, 30, 20);
        $this->price($oil, $agora, 27, 2);     // down

        Artisan::call('purchasing:price-rise-alert');

        $this->assertDatabaseHas('sms_logs', ['to' => '+9607771234', 'type' => 'owner_price_rise', 'reference_type' => 'price_rise_alert']);
        $body = (string) SmsLog::query()->where('reference_type', 'price_rise_alert')->value('message');
        $this->assertStringContainsString('Flour +20% (10.00→12.00/kg)', $body);
        $this->assertStringNotContainsString('Eggs', $body);
        $this->assertStringNotContainsString('Oil', $body);
    }

    public function test_it_is_silent_when_off_or_when_nothing_rose(): void
    {
        $this->makeOwner(['phone' => '9607771234']);
        $agora = Supplier::create(['name' => 'Agora']);
        $flour = InventoryItem::create(['name' => 'Flour', 'unit' => 'kg', 'unit_cost' => 12, 'is_active' => true]);
        $this->price($flour, $agora, 10, 20);
        $this->price($flour, $agora, 12, 2);

        SiteSetting::set('ops_price_rise_alert_sms', '0');
        Artisan::call('purchasing:price-rise-alert');
        $this->assertDatabaseMissing('sms_logs', ['reference_type' => 'price_rise_alert']);

        SiteSetting::set('ops_price_rise_alert_sms', '1');
        SupplierPriceHistory::query()->delete();
        $this->price($flour, $agora, 12, 2);
        Artisan::call('purchasing:price-rise-alert');
        $this->assertDatabaseMissing('sms_logs', ['reference_type' => 'price_rise_alert']);
    }
}
