<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Customer;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RequirePermissionMiddlewareTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_token_cannot_access_permission_only_staff_routes(): void
    {
        $customer = Customer::create([
            'name' => 'Guest',
            'phone' => '+9607009999',
            'is_active' => true,
        ]);

        Sanctum::actingAs($customer, ['customer']);

        $this->getJson('/api/invoices')->assertForbidden();
    }

    public function test_staff_user_token_without_staff_ability_is_rejected(): void
    {
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        $user = User::create([
            'name' => 'Owner',
            'email' => 'owner-perm@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        Sanctum::actingAs($user, ['customer']);

        $this->getJson('/api/invoices')->assertForbidden();
    }
}
