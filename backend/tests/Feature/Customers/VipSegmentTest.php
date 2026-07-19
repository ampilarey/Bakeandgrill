<?php

declare(strict_types=1);

namespace Tests\Feature\Customers;

use App\Domains\Customers\Services\VipSettingsService;
use App\Domains\Customers\Services\VipTagSyncService;
use App\Domains\Notifications\Services\BulkSmsService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\CustomerTag;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class VipSegmentTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'owner@vip.test',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->firstOrFail()->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    public function test_vip_segment_requires_spend_and_order_thresholds(): void
    {
        $vip = $this->makeCustomer(['phone' => '+9607910001']);
        $almost = $this->makeCustomer(['phone' => '+9607910002']);
        $once = $this->makeCustomer(['phone' => '+9607910003']);

        Order::factory()->count(2)->create([
            'customer_id' => $vip->id,
            'status' => 'paid',
            'total' => 3000.00,
            'paid_at' => now(),
        ]);
        Order::factory()->count(2)->create([
            'customer_id' => $almost->id,
            'status' => 'paid',
            'total' => 1000.00,
            'paid_at' => now(),
        ]);
        Order::factory()->create([
            'customer_id' => $once->id,
            'status' => 'paid',
            'total' => 9000.00,
            'paid_at' => now(),
        ]);

        Sanctum::actingAs($this->owner, ['staff']);
        $ids = collect($this->getJson('/api/admin/customers/segments/vip_customers')->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($vip->id));
        $this->assertFalse($ids->contains($almost->id));
        $this->assertFalse($ids->contains($once->id));
    }

    public function test_metrics_include_vip_count_and_settings(): void
    {
        $vip = $this->makeCustomer(['phone' => '+9607910101']);
        Order::factory()->count(2)->create([
            'customer_id' => $vip->id,
            'status' => 'paid',
            'total' => 3000.00,
            'paid_at' => now(),
        ]);

        Sanctum::actingAs($this->owner, ['staff']);
        $this->getJson('/api/admin/customers/metrics')
            ->assertOk()
            ->assertJsonPath('metrics.vip_customers', 1)
            ->assertJsonPath('metrics.vip.min_spend_mvr', 5000)
            ->assertJsonPath('metrics.vip.min_paid_orders', 2);
    }

    public function test_vip_settings_are_configurable(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $this->putJson('/api/admin/customers/vip-settings', [
            'min_spend_mvr' => 1000,
            'min_paid_orders' => 1,
            'auto_sync_tag' => true,
        ])->assertOk()
            ->assertJsonPath('settings.min_spend_mvr', 1000)
            ->assertJsonPath('settings.min_paid_orders', 1);

        $customer = $this->makeCustomer(['phone' => '+9607910201']);
        Order::factory()->create([
            'customer_id' => $customer->id,
            'status' => 'paid',
            'total' => 1500.00,
            'paid_at' => now(),
        ]);

        $ids = collect($this->getJson('/api/admin/customers/segments/vip_customers')->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($customer->id));
    }

    public function test_vip_tag_sync_attaches_and_detaches(): void
    {
        CustomerTag::query()->firstOrCreate(
            ['name' => 'VIP'],
            ['color' => '#D4813A', 'description' => 'High-value'],
        );

        app(VipSettingsService::class)->update([
            'min_spend_mvr' => 5000,
            'min_paid_orders' => 2,
            'auto_sync_tag' => true,
        ]);

        $vip = $this->makeCustomer(['phone' => '+9607910301']);
        Order::factory()->count(2)->create([
            'customer_id' => $vip->id,
            'status' => 'paid',
            'total' => 3000.00,
            'paid_at' => now(),
        ]);

        $result = app(VipTagSyncService::class)->syncAll();
        $this->assertSame(1, $result['vip_count']);
        $this->assertTrue($vip->fresh()->tags()->where('name', 'VIP')->exists());

        app(VipSettingsService::class)->update(['min_spend_mvr' => 20000]);
        app(VipTagSyncService::class)->syncAll();
        $this->assertFalse($vip->fresh()->tags()->where('name', 'VIP')->exists());
    }

    public function test_bulk_sms_can_target_vip_segment(): void
    {
        $vip = $this->makeCustomer(['phone' => '+9607910401']);
        $other = $this->makeCustomer(['phone' => '+9607910402']);

        Order::factory()->count(2)->create([
            'customer_id' => $vip->id,
            'status' => 'paid',
            'total' => 3000.00,
            'paid_at' => now(),
        ]);
        Order::factory()->create([
            'customer_id' => $other->id,
            'status' => 'paid',
            'total' => 100.00,
            'paid_at' => now(),
        ]);

        $audience = app(BulkSmsService::class)->resolveAudience([
            'segment' => 'vip_customers',
            'opted_in' => true,
        ]);

        $this->assertSame(1, $audience->count());
        $this->assertSame($vip->id, $audience->first()->id);
    }

    public function test_pos_summary_includes_is_vip(): void
    {
        $vip = $this->makeCustomer(['phone' => '+9607910501']);
        Order::factory()->count(2)->create([
            'customer_id' => $vip->id,
            'status' => 'paid',
            'total' => 3000.00,
            'paid_at' => now(),
        ]);

        Sanctum::actingAs($this->owner, ['staff']);
        $this->getJson("/api/customers/{$vip->id}/pos-summary")
            ->assertOk()
            ->assertJsonPath('is_vip', true)
            ->assertJsonPath('customer.is_vip', true);
    }
}
