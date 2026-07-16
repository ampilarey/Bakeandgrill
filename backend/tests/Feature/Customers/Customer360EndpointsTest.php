<?php

declare(strict_types=1);

namespace Tests\Feature\Customers;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use App\Models\CustomerFollowUpNote;
use App\Models\LoyaltyLedger;
use App\Models\Order;
use App\Models\Role;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class Customer360EndpointsTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'owner@c360.test',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->firstOrFail()->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->customer = Customer::factory()->create([
            'name' => 'Ahmed',
            'phone' => '+9607900999',
            'is_profile_complete' => true,
        ]);

        Order::factory()->create([
            'customer_id' => $this->customer->id,
            'status' => 'completed',
            'total' => 42.5,
            'paid_at' => now()->subDay(),
            'type' => 'takeaway',
        ]);
        Order::factory()->create([
            'customer_id' => $this->customer->id,
            'status' => 'cancelled',
            'total' => 10,
            'cancelled_at' => now(),
            'paid_at' => null,
        ]);

        SmsLog::create([
            'customer_id' => $this->customer->id,
            'to' => $this->customer->phone,
            'message' => 'OTP code',
            'type' => 'otp',
            'status' => 'demo',
            'provider' => 'demo',
        ]);

        // Regression: nullish SMS fields must not 500 the activity timeline.
        SmsLog::create([
            'customer_id' => $this->customer->id,
            'to' => $this->customer->phone,
            'message' => '',
            'type' => 'otp',
            'status' => 'demo',
            'provider' => 'demo',
        ]);

        LoyaltyLedger::create([
            'idempotency_key' => 'c360-test-1',
            'customer_id' => $this->customer->id,
            'type' => 'earn',
            'points' => 5,
            'balance_after' => 5,
            'occurred_at' => now(),
        ]);

        CustomerFollowUpNote::create([
            'customer_id' => $this->customer->id,
            'staff_id' => $this->owner->id,
            'note' => 'Follow up about catering',
        ]);
    }

    #[Test]
    public function growth_summary_and_activity_succeed_for_rich_customer(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $this->getJson("/api/admin/customers/{$this->customer->id}/growth-summary")
            ->assertOk()
            ->assertJsonPath('summary.profile.id', $this->customer->id)
            ->assertJsonPath('summary.lifetime.paid_orders_count', 1);

        $this->getJson("/api/admin/customers/{$this->customer->id}/activity")
            ->assertOk()
            ->assertJsonStructure(['timeline']);
    }
}
