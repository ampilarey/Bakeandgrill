<?php

declare(strict_types=1);

namespace Tests\Feature\Deposits;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DepositActivityReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_deposit_activity_report_separates_liability_movements_from_sales(): void
    {
        PermissionCatalogSync::sync();
        Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'is_active' => true]);
        $managerRole = Role::where('slug', 'manager')->firstOrFail();

        $manager = User::create([
            'name' => 'Deposit Reporter',
            'email' => 'deposit-reporter@test.local',
            'password' => Hash::make('password'),
            'role_id' => $managerRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $customer = Customer::create(['name' => 'Activity Customer', 'phone' => '+9607111222']);

        Sanctum::actingAs($manager, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $this->postJson("/api/admin/customers/{$customer->id}/deposit/top-up", [
            'amount_mvr' => 50,
            'method' => 'cash',
        ])->assertCreated();

        $from = now()->subDay()->toDateString();
        $to = now()->addDay()->toDateString();

        $this->getJson("/api/reports/deposit-activity?from={$from}&to={$to}")
            ->assertOk()
            ->assertJsonPath('received', 50)
            ->assertJsonStructure(['received', 'used', 'payouts', 'transfers']);
    }
}
