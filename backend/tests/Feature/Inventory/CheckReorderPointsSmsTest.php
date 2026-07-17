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
            'type' => 'system',
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
