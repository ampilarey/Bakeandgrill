<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Models\InventoryItem;
use App\Models\InventoryReorderAlert;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class CheckReorderPointsSmsTest extends TestCase
{
    use RefreshDatabase;

    public function test_check_reorder_sends_sms_when_enabled_and_new_alerts_created(): void
    {
        $owner = $this->makeOwner(['phone' => '9607771234']);
        SiteSetting::set('ops_inventory_reorder_alert_sms', '1');

        InventoryItem::create([
            'name' => 'Flour',
            'sku' => 'FLR-SMS',
            'unit' => 'kg',
            'current_stock' => 2,
            'reorder_point' => 10,
            'unit_cost' => 4,
            'is_active' => true,
        ]);

        Artisan::call('inventory:check-reorder');

        $this->assertSame(1, InventoryReorderAlert::query()->whereNull('resolved_at')->count());
        $this->assertDatabaseHas('sms_logs', [
            'to' => '+9607771234',
            'type' => 'owner_stock_reorder',
            'reference_type' => 'inventory_reorder_alert',
        ]);
        $body = SmsLog::query()->where('reference_type', 'inventory_reorder_alert')->value('message');
        $this->assertStringContainsString('Flour', (string) $body);
        $this->assertStringContainsString('reorder point', (string) $body);
        unset($owner);
    }

    public function test_check_reorder_skips_sms_when_disabled(): void
    {
        $this->makeOwner(['phone' => '9607771234']);
        SiteSetting::set('ops_inventory_reorder_alert_sms', '0');

        InventoryItem::create([
            'name' => 'Sugar',
            'sku' => 'SGR-SMS',
            'unit' => 'kg',
            'current_stock' => 1,
            'reorder_point' => 5,
            'unit_cost' => 3,
            'is_active' => true,
        ]);

        Artisan::call('inventory:check-reorder');

        $this->assertSame(1, InventoryReorderAlert::query()->whereNull('resolved_at')->count());
        $this->assertDatabaseMissing('sms_logs', [
            'reference_type' => 'inventory_reorder_alert',
        ]);
    }

    public function test_check_reorder_skips_sms_for_snoozed_items(): void
    {
        $this->makeOwner(['phone' => '9607771234']);
        SiteSetting::set('ops_inventory_reorder_alert_sms', '1');

        InventoryItem::create([
            'name' => 'Butter',
            'sku' => 'BTR-SMS',
            'unit' => 'kg',
            'current_stock' => 0,
            'reorder_point' => 5,
            'unit_cost' => 8,
            'restock_snoozed_until' => now()->addDays(7)->toDateString(),
            'is_active' => true,
        ]);

        Artisan::call('inventory:check-reorder');

        $this->assertSame(1, InventoryReorderAlert::query()->whereNull('resolved_at')->count());
        $this->assertDatabaseMissing('sms_logs', [
            'reference_type' => 'inventory_reorder_alert',
        ]);
    }

    public function test_an_alert_is_texted_when_its_snooze_ends_and_again_after_a_week(): void
    {
        $this->makeOwner(['phone' => '9607771234']);
        SiteSetting::set('ops_inventory_reorder_alert_sms', '1');
        $item = InventoryItem::create([
            'name' => 'Butter', 'sku' => 'BTR-SNZ', 'unit' => 'kg', 'current_stock' => 0, 'reorder_point' => 5, 'unit_cost' => 8,
            'restock_snoozed_until' => now()->addDays(2)->toDateString(), 'is_active' => true,
        ]);

        Artisan::call('inventory:check-reorder');
        $this->assertSame(0, SmsLog::where('reference_type', 'inventory_reorder_alert')->count(), 'snoozed: quiet');
        $this->assertNull(InventoryReorderAlert::firstOrFail()->notified_at);

        $this->travel(3)->days();
        Artisan::call('inventory:check-reorder');
        $this->assertSame(1, SmsLog::where('reference_type', 'inventory_reorder_alert')->count(), 'snooze over: texted although the alert is old');
        $this->assertNotNull(InventoryReorderAlert::firstOrFail()->notified_at);

        $this->travel(1)->days();
        Artisan::call('inventory:check-reorder');
        $this->assertSame(1, SmsLog::where('reference_type', 'inventory_reorder_alert')->count(), 'not every day');

        $this->travel(7)->days();
        Artisan::call('inventory:check-reorder');
        $this->assertSame(2, SmsLog::where('reference_type', 'inventory_reorder_alert')->count(), 'still open a week later: reminded');

        $item->update(['current_stock' => 50]);
        Artisan::call('inventory:check-reorder');
        $this->assertNotNull(InventoryReorderAlert::firstOrFail()->resolved_at);
    }

    public function test_expiring_stock_is_texted_once_a_day_under_the_same_switch(): void
    {
        $this->makeOwner(['phone' => '9607771234']);
        SiteSetting::set('ops_inventory_reorder_alert_sms', '1');
        InventoryItem::create(['name' => 'Cream', 'sku' => 'CRM-EXP', 'unit' => 'l', 'current_stock' => 3, 'reorder_point' => 1, 'unit_cost' => 8, 'expiry_date' => now()->addDays(2)->toDateString(), 'is_active' => true]);
        InventoryItem::create(['name' => 'Old yeast', 'sku' => 'YST-EXP', 'unit' => 'g', 'current_stock' => 0, 'reorder_point' => 1, 'unit_cost' => 8, 'expiry_date' => now()->subDay()->toDateString(), 'is_active' => true]);
        InventoryItem::create(['name' => 'Flour', 'sku' => 'FLR-EXP', 'unit' => 'kg', 'current_stock' => 30, 'reorder_point' => 1, 'unit_cost' => 8, 'expiry_date' => now()->addDays(60)->toDateString(), 'is_active' => true]);

        Artisan::call('inventory:check-expiry --days=7');
        Artisan::call('inventory:check-expiry --days=7');

        $logs = SmsLog::where('reference_type', 'inventory_expiry_alert')->get();
        $this->assertCount(1, $logs, 'one text a day');
        $this->assertStringContainsString('1 inventory item(s) expire within 7 days: Cream (2d)', (string) $logs[0]->message);
        $this->assertStringNotContainsString('Old yeast', (string) $logs[0]->message, 'nothing in stock, nothing to use up');
        $this->assertStringNotContainsString('Flour', (string) $logs[0]->message);

        SiteSetting::set('ops_inventory_reorder_alert_sms', '0');
        SiteSetting::bust();
        $this->travel(1)->days();
        Artisan::call('inventory:check-expiry --days=7');
        $this->assertSame(1, SmsLog::where('reference_type', 'inventory_expiry_alert')->count(), 'switch off: quiet');
    }

    public function test_check_reorder_skips_alerts_for_excluded_items(): void
    {
        $this->makeOwner(['phone' => '9607771234']);
        SiteSetting::set('ops_inventory_reorder_alert_sms', '1');

        InventoryItem::create([
            'name' => 'Party Picks',
            'sku' => 'PP-EXCL',
            'unit' => 'pcs',
            'current_stock' => 0,
            'reorder_point' => 5,
            'unit_cost' => 1,
            'restock_excluded' => true,
            'is_active' => true,
        ]);

        Artisan::call('inventory:check-reorder');

        $this->assertSame(0, InventoryReorderAlert::query()->whereNull('resolved_at')->count());
        $this->assertDatabaseMissing('sms_logs', [
            'reference_type' => 'inventory_reorder_alert',
        ]);
    }
}
