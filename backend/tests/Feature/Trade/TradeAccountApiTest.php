<?php

declare(strict_types=1);

namespace Tests\Feature\Trade;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Role;
use App\Models\TradeAccount;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class TradeAccountApiTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $manager;

    private User $cashier;

    private User $viewer;

    private Customer $customer;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        $ownerRole = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        $managerRole = Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'is_active' => true]);
        $staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);

        $this->owner = User::create([
            'name' => 'Owner', 'email' => 'trade-owner@test.local', 'phone' => '7702001',
            'password' => Hash::make('password'), 'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $this->manager = User::create([
            'name' => 'Manager', 'email' => 'trade-mgr@test.local', 'phone' => '7702002',
            'password' => Hash::make('password'), 'role_id' => $managerRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $this->cashier = User::create([
            'name' => 'Cashier', 'email' => 'trade-cash@test.local', 'phone' => '7702003',
            'password' => Hash::make('password'), 'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $this->viewer = User::create([
            'name' => 'Viewer', 'email' => 'trade-view@test.local', 'phone' => '7702004',
            'password' => Hash::make('password'), 'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $this->viewer->grantPermission('trade.view');

        $this->customer = Customer::create([
            'name' => 'Shop Customer',
            'phone' => '+9607002001',
            'is_active' => true,
            'credit_enabled' => false,
            'credit_payment_terms_days' => 45,
            'credit_limit_laar' => 500000,
            'credit_status' => 'active',
        ]);

        $category = Category::create(['name' => 'Trade Cat', 'slug' => 'trade-cat', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Trade Momo',
            'base_price' => 80.00,
            'sku' => 'TRD-MOMO',
            'is_active' => true,
            'is_available' => true,
        ]);
    }

    #[Test]
    public function cannot_create_two_accounts_for_same_customer(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $payload = [
            'customer_id' => $this->customer->id,
            'shop_name' => 'Island Mart',
        ];

        $this->postJson('/api/admin/trade-accounts', $payload)->assertCreated();
        $this->postJson('/api/admin/trade-accounts', $payload)
            ->assertStatus(422);
    }

    #[Test]
    public function payment_terms_days_falls_back_to_customer_when_null(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $res = $this->postJson('/api/admin/trade-accounts', [
            'customer_id' => $this->customer->id,
            'shop_name' => 'Island Mart',
            'payment_terms_days' => null,
        ])->assertCreated();

        $accountId = $res->json('trade_account.id');
        $show = $this->getJson("/api/admin/trade-accounts/{$accountId}")->assertOk();

        $this->assertNull($show->json('trade_account.payment_terms_days'));
        $this->assertSame(45, $show->json('trade_account.resolved_payment_terms_days'));
    }

    #[Test]
    public function payment_terms_days_overrides_customer_when_set(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $res = $this->postJson('/api/admin/trade-accounts', [
            'customer_id' => $this->customer->id,
            'shop_name' => 'Island Mart',
            'payment_terms_days' => 14,
        ])->assertCreated();

        $accountId = $res->json('trade_account.id');
        $show = $this->getJson("/api/admin/trade-accounts/{$accountId}")->assertOk();

        $this->assertSame(14, $show->json('trade_account.payment_terms_days'));
        $this->assertSame(14, $show->json('trade_account.resolved_payment_terms_days'));
    }

    #[Test]
    public function trade_view_cannot_create_account_or_edit_prices(): void
    {
        Sanctum::actingAs($this->viewer, ['staff']);

        $this->postJson('/api/admin/trade-accounts', [
            'customer_id' => $this->customer->id,
            'shop_name' => 'Nope',
        ])->assertForbidden();

        $account = TradeAccount::create([
            'customer_id' => $this->customer->id,
            'shop_name' => 'Existing',
            'is_active' => true,
        ]);

        $this->postJson("/api/admin/trade-accounts/{$account->id}/prices", [
            'item_id' => $this->item->id,
            'price_laar' => 5000,
        ])->assertForbidden();
    }

    #[Test]
    public function manager_and_cashier_have_no_trade_permissions_by_default(): void
    {
        $perms = app(\App\Services\PermissionService::class);

        $this->assertFalse($perms->hasPermission($this->manager, 'trade.view'));
        $this->assertFalse($perms->hasPermission($this->manager, 'trade.manage_accounts'));
        $this->assertFalse($perms->hasPermission($this->manager, 'trade.manage_prices'));

        $this->assertFalse($perms->hasPermission($this->cashier, 'trade.view'));
        $this->assertFalse($perms->hasPermission($this->cashier, 'trade.manage_accounts'));
        $this->assertFalse($perms->hasPermission($this->cashier, 'trade.manage_prices'));

        Sanctum::actingAs($this->manager, ['staff']);
        $this->getJson('/api/admin/trade-accounts')->assertForbidden();

        Sanctum::actingAs($this->cashier, ['staff']);
        $this->getJson('/api/admin/trade-accounts')->assertForbidden();
    }

    #[Test]
    public function owner_has_all_three_trade_permissions(): void
    {
        $perms = app(\App\Services\PermissionService::class);

        $this->assertTrue($perms->hasPermission($this->owner, 'trade.view'));
        $this->assertTrue($perms->hasPermission($this->owner, 'trade.manage_accounts'));
        $this->assertTrue($perms->hasPermission($this->owner, 'trade.manage_prices'));

        Sanctum::actingAs($this->owner, ['staff']);
        $this->getJson('/api/admin/trade-accounts')->assertOk();
    }

    #[Test]
    public function price_preview_reports_source_rule(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $account = TradeAccount::create([
            'customer_id' => $this->customer->id,
            'shop_name' => 'Preview Shop',
            'default_discount_bp' => 1000,
            'is_active' => true,
        ]);

        $res = $this->getJson(
            "/api/admin/trade-accounts/{$account->id}/price-preview?item_id={$this->item->id}",
        )->assertOk();

        $this->assertTrue($res->json('found'));
        $this->assertSame('retail_discount', $res->json('source'));
        $this->assertSame(7200, $res->json('price_laar')); // 80.00 − 10%
    }

    #[Test]
    public function deactivate_sets_is_active_false(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $account = TradeAccount::create([
            'customer_id' => $this->customer->id,
            'shop_name' => 'Close Me',
            'is_active' => true,
        ]);

        $this->postJson("/api/admin/trade-accounts/{$account->id}/deactivate")
            ->assertOk()
            ->assertJsonPath('trade_account.is_active', false);

        $this->assertFalse($account->fresh()->is_active);
    }
}
