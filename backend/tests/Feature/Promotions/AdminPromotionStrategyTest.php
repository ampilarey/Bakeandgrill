<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminPromotionStrategyTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        $this->owner = User::create([
            'name' => 'Owner Strat',
            'email' => 'owner-strat@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
    }

    public function test_can_create_tiered_bogo_and_free_delivery_promos(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $tiered = $this->postJson('/api/admin/promotions', [
            'name' => 'Spend save',
            'code' => 'TIER1',
            'type' => 'tiered',
            'discount_value' => 0,
            'budget_laar' => 50000,
            'first_order_only' => false,
            'metadata' => [
                'tiers' => [
                    ['min_laar' => 30000, 'kind' => 'fixed', 'value' => 3000],
                ],
            ],
        ])->assertCreated();
        $tiered->assertJsonPath('promotion.type', 'tiered');
        $tiered->assertJsonPath('promotion.budget_laar', 50000);

        $this->postJson('/api/admin/promotions', [
            'name' => 'BOGO',
            'code' => 'BOGO1',
            'type' => 'buy_x_get_y',
            'discount_value' => 0,
            'first_order_only' => true,
            'metadata' => [
                'buy_qty' => 2,
                'get_qty' => 1,
                'get_discount_pct' => 100,
                'cheapest' => true,
            ],
        ])->assertCreated()
            ->assertJsonPath('promotion.first_order_only', true);

        $this->postJson('/api/admin/promotions', [
            'name' => 'Free del',
            'code' => 'FD1',
            'type' => 'free_delivery',
            'discount_value' => 0,
            'min_order_laar' => 20000,
        ])->assertCreated()
            ->assertJsonPath('promotion.waive_delivery', true)
            ->assertJsonPath('promotion.type', 'free_delivery');
    }

    public function test_margin_floor_settings_on_discount_controls(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $this->patchJson('/api/admin/discounts/controls', [
            'discount_margin_floor_enabled' => true,
            'discount_margin_floor_pct' => 12,
            'discount_reasons' => ['Loyal customer'],
        ])->assertOk()
            ->assertJsonPath('discount_margin_floor_enabled', true)
            ->assertJsonPath('discount_margin_floor_pct', 12);

        $this->getJson('/api/admin/discounts/controls')
            ->assertOk()
            ->assertJsonPath('discount_margin_floor_enabled', true)
            ->assertJsonPath('discount_margin_floor_pct', 12);
    }
}
