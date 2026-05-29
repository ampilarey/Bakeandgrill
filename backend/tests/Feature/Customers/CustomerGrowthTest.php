<?php

declare(strict_types=1);

namespace Tests\Feature\Customers;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use App\Models\LoyaltyAccount;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerGrowthTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staffNoAnalytics;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'owner@growth.test',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->firstOrFail()->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->staffNoAnalytics = User::create([
            'name' => 'Staff',
            'email' => 'staff@growth.test',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'staff')->firstOrFail()->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    public function test_metrics_requires_customers_analytics_permission(): void
    {
        Sanctum::actingAs($this->staffNoAnalytics, ['staff']);

        $this->getJson('/api/admin/customers/metrics')->assertStatus(403);

        Sanctum::actingAs($this->owner, ['staff']);
        $this->getJson('/api/admin/customers/metrics')->assertOk()
            ->assertJsonStructure(['metrics' => ['total_customers', 'repeat_rate', 'trends']]);
    }

    public function test_segments_require_customers_manage(): void
    {
        $this->getJson('/api/admin/customers/segments')->assertStatus(401);

        Sanctum::actingAs($this->owner, ['staff']);
        $this->getJson('/api/admin/customers/segments')->assertOk()
            ->assertJsonStructure(['segments']);
    }

    public function test_metrics_count_only_paid_orders_for_revenue(): void
    {
        $customer = $this->makeCustomer();
        Order::factory()->create([
            'customer_id' => $customer->id,
            'status' => 'cancelled',
            'total' => 500.00,
            'paid_at' => null,
        ]);
        Order::factory()->create([
            'customer_id' => $customer->id,
            'status' => 'pending',
            'total' => 300.00,
            'paid_at' => null,
        ]);
        Order::factory()->create([
            'customer_id' => $customer->id,
            'status' => 'paid',
            'total' => 100.00,
            'paid_at' => now(),
        ]);

        Sanctum::actingAs($this->owner, ['staff']);
        $response = $this->getJson('/api/admin/customers/metrics')->assertOk();

        $this->assertSame(100.0, (float) $response->json('metrics.total_paid_revenue'));
        $this->assertSame(1, (int) $response->json('metrics.total_paid_orders'));
    }

    public function test_growth_summary_uses_full_lifetime_paid_spend(): void
    {
        $customer = $this->makeCustomer();
        foreach ([50.0, 75.0, 25.0] as $total) {
            Order::factory()->create([
                'customer_id' => $customer->id,
                'status' => 'paid',
                'total' => $total,
                'paid_at' => now(),
            ]);
        }

        Sanctum::actingAs($this->owner, ['staff']);
        $this->getJson("/api/admin/customers/{$customer->id}/growth-summary")
            ->assertOk()
            ->assertJsonPath('summary.lifetime.paid_orders_count', 3)
            ->assertJsonPath('summary.lifetime.total_paid_spend', 150);
    }

    public function test_repeat_customers_segment_requires_two_paid_orders(): void
    {
        $repeat = $this->makeCustomer(['phone' => '+9607900101']);
        $once = $this->makeCustomer(['phone' => '+9607900102']);

        Order::factory()->count(2)->create([
            'customer_id' => $repeat->id,
            'status' => 'paid',
            'total' => 20.00,
            'paid_at' => now(),
        ]);
        Order::factory()->create([
            'customer_id' => $once->id,
            'status' => 'paid',
            'total' => 20.00,
            'paid_at' => now(),
        ]);

        Sanctum::actingAs($this->owner, ['staff']);
        $response = $this->getJson('/api/admin/customers/segments/repeat_customers')->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();

        $this->assertContains($repeat->id, $ids);
        $this->assertNotContains($once->id, $ids);
    }

    public function test_dormant_segment_excludes_recent_buyers(): void
    {
        $dormant = $this->makeCustomer(['phone' => '+9607900201']);
        $active = $this->makeCustomer(['phone' => '+9607900202']);

        Order::factory()->create([
            'customer_id' => $dormant->id,
            'status' => 'paid',
            'total' => 10.00,
            'paid_at' => now()->subDays(45),
        ]);
        Order::factory()->create([
            'customer_id' => $active->id,
            'status' => 'paid',
            'total' => 10.00,
            'paid_at' => now()->subDays(2),
        ]);

        Sanctum::actingAs($this->owner, ['staff']);
        $ids = collect($this->getJson('/api/admin/customers/segments/dormant_30d')->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($dormant->id));
        $this->assertFalse($ids->contains($active->id));
    }

    public function test_credit_approved_segment_only_includes_enabled_credit(): void
    {
        $credit = $this->makeCustomer(['phone' => '+9607900301', 'credit_enabled' => true]);
        $this->makeCustomer(['phone' => '+9607900302', 'credit_enabled' => false]);

        Sanctum::actingAs($this->owner, ['staff']);
        $ids = collect($this->getJson('/api/admin/customers/segments/credit_approved')->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($credit->id));
        $this->assertSame(1, $ids->count());
    }

    public function test_send_sms_refuses_opted_out_customer(): void
    {
        $customer = $this->makeCustomer(['sms_opt_out' => true]);

        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson("/api/admin/customers/{$customer->id}/send-sms", [
            'message' => 'Hello from admin',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['message']);
    }

    public function test_internal_notes_not_exposed_on_customer_me(): void
    {
        $customer = $this->makeCustomer(['internal_notes' => 'Secret staff note']);
        Sanctum::actingAs($customer, ['customer']);

        $response = $this->getJson('/api/customer/me')->assertOk();
        $body = json_encode($response->json());

        $this->assertStringNotContainsString('Secret staff note', (string) $body);
        $this->assertArrayNotHasKey('internal_notes', $response->json('customer') ?? $response->json());
    }

    public function test_merge_preserves_orders_loyalty_and_credit(): void
    {
        $primary = $this->makeCustomer(['phone' => '+9607900401']);
        $source = $this->makeCustomer(['phone' => '+9607900402']);

        Order::factory()->create([
            'customer_id' => $source->id,
            'status' => 'paid',
            'total' => 80.00,
            'paid_at' => now(),
        ]);

        LoyaltyAccount::create([
            'customer_id' => $source->id,
            'points_balance' => 120,
            'points_held' => 0,
            'lifetime_points' => 120,
            'tier' => 'bronze',
        ]);

        $source->update([
            'credit_enabled' => true,
            'credit_balance_laar' => 5000,
            'credit_limit_laar' => 10000,
            'credit_status' => 'active',
        ]);

        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson("/api/admin/customers/{$primary->id}/merge", [
            'source_customer_ids' => [$source->id],
        ])->assertOk();

        $this->assertSame(1, Order::where('customer_id', $primary->id)->whereNotNull('paid_at')->count());
        $this->assertSame(120, (int) LoyaltyAccount::where('customer_id', $primary->id)->value('points_balance'));
        $primary->refresh();
        $this->assertSame(5000, (int) $primary->credit_balance_laar);
    }
}
