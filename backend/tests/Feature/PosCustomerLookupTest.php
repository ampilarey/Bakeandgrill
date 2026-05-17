<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * GET /api/customers/search + POST /api/customers/quick
 *
 * The POS Customer Picker hits these on every keystroke and on
 * quick-create. They live OUTSIDE the customers.manage permission so
 * any authenticated cashier can use them. The behaviour we care about:
 *
 *   - search by name OR phone OR email (LIKE)
 *   - search by normalised phone (so "+9607123456" matches "07123456")
 *   - search ignores < 2 char queries (UX, no DoS)
 *   - quick-create is idempotent on phone (no duplicates)
 *   - quick-create never overwrites an existing customer's name
 *   - customer tokens are rejected on both endpoints
 */
class PosCustomerLookupTest extends TestCase
{
    use RefreshDatabase;

    private User $staffUser;

    protected function setUp(): void
    {
        parent::setUp();
        $role = Role::create(['name' => 'Cashier', 'slug' => 'cashier', 'is_active' => true]);
        $this->staffUser = User::create([
            'name' => 'Cashier',
            'email' => 'cashier@lookup.test',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    public function test_search_returns_matches_by_name(): void
    {
        Customer::create(['name' => 'Aisha Said', 'phone' => '+9607770001', 'is_active' => true]);
        Customer::create(['name' => 'Mohamed Ali', 'phone' => '+9607770002', 'is_active' => true]);

        Sanctum::actingAs($this->staffUser, ['staff']);
        $res = $this->getJson('/api/customers/search?q=aisha');
        $res->assertOk();
        $this->assertCount(1, $res->json('data'));
        $this->assertEquals('Aisha Said', $res->json('data.0.name'));
    }

    public function test_search_returns_matches_by_phone_with_normalisation(): void
    {
        Customer::create(['name' => 'Maldives Customer', 'phone' => '+9607123456', 'is_active' => true]);

        Sanctum::actingAs($this->staffUser, ['staff']);

        // Local-style number — PhoneNormalizer should turn this into +9607123456 and match.
        $res = $this->getJson('/api/customers/search?q=07123456');
        $res->assertOk();
        $this->assertGreaterThanOrEqual(1, count($res->json('data')));
        $this->assertEquals('+9607123456', $res->json('data.0.phone'));
    }

    public function test_search_ignores_short_queries(): void
    {
        Customer::create(['name' => 'A', 'phone' => '+9607770099', 'is_active' => true]);

        Sanctum::actingAs($this->staffUser, ['staff']);
        $res = $this->getJson('/api/customers/search?q=a');
        $res->assertOk();
        $this->assertSame([], $res->json('data'));
    }

    public function test_search_rejects_customer_token(): void
    {
        $customer = Customer::create(['name' => 'Self', 'phone' => '+9607770100', 'is_active' => true]);
        Sanctum::actingAs($customer, ['customer']);
        $this->getJson('/api/customers/search?q=anything')->assertForbidden();
    }

    public function test_quick_create_creates_new_customer_when_phone_unknown(): void
    {
        Sanctum::actingAs($this->staffUser, ['staff']);
        $res = $this->postJson('/api/customers/quick', [
            'phone' => '+9607880100',
            'name' => 'Walk-in Walid',
        ]);
        $res->assertStatus(201);
        $res->assertJsonPath('created', true);
        $this->assertDatabaseHas('customers', [
            'phone' => '+9607880100',
            'name' => 'Walk-in Walid',
        ]);
    }

    public function test_quick_create_is_idempotent_on_phone(): void
    {
        $existing = Customer::create(['name' => 'Old Name', 'phone' => '+9607880200', 'is_active' => true]);

        Sanctum::actingAs($this->staffUser, ['staff']);
        $res = $this->postJson('/api/customers/quick', [
            'phone' => '+9607880200',
            'name' => 'Should Not Overwrite',
        ]);
        $res->assertOk();
        $res->assertJsonPath('created', false);
        $res->assertJsonPath('customer.id', $existing->id);

        // Critical: the existing customer's name must NOT be clobbered.
        $existing->refresh();
        $this->assertSame('Old Name', $existing->name);
        $this->assertSame(1, Customer::where('phone', '+9607880200')->count());
    }

    public function test_quick_create_fills_name_only_when_existing_customer_has_none(): void
    {
        $existing = Customer::create(['name' => null, 'phone' => '+9607880300', 'is_active' => true]);

        Sanctum::actingAs($this->staffUser, ['staff']);
        $this->postJson('/api/customers/quick', [
            'phone' => '+9607880300',
            'name' => 'First Time Filled',
        ])->assertOk();

        $existing->refresh();
        $this->assertSame('First Time Filled', $existing->name);
    }

    public function test_quick_create_rejects_customer_token(): void
    {
        $customer = Customer::create(['name' => 'Self', 'phone' => '+9607880400', 'is_active' => true]);
        Sanctum::actingAs($customer, ['customer']);
        $this->postJson('/api/customers/quick', ['phone' => '+9607880401'])->assertForbidden();
    }

    public function test_quick_create_rejects_invalid_phone(): void
    {
        Sanctum::actingAs($this->staffUser, ['staff']);
        $this->postJson('/api/customers/quick', ['phone' => 'not-a-phone'])
            ->assertStatus(422);
    }
}
