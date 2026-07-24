<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DiscountControlsControllerTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $this->manager = User::create([
            'name' => 'Manager DC',
            'email' => 'mgr-dc@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'manager')->value('id'),
            'is_active' => true,
        ]);
        $this->staff = User::create([
            'name' => 'Staff DC',
            'email' => 'staff-dc@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'staff')->value('id'),
            'is_active' => true,
        ]);
    }

    public function test_get_returns_config(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);

        $this->getJson('/api/admin/discounts/controls')
            ->assertOk()
            ->assertJsonPath('discount_manual_enabled', true)
            ->assertJsonPath('discount_max_percent', 100)
            ->assertJsonPath('discount_approval_required', false)
            ->assertJsonStructure([
                'discount_reasons',
                'discount_approval_approvers',
                'roles_with_discounts',
                'roles_with_override',
            ]);
    }

    public function test_patch_persists_and_audits(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);

        $this->patchJson('/api/admin/discounts/controls', [
            'discount_max_percent' => 15,
            'discount_approval_required' => true,
            'discount_approval_approvers' => [
                ['phone' => '7654321', 'label' => 'Boss', 'user_id' => $this->manager->id],
            ],
            'discount_reasons' => ['Loyal customer', 'Staff meal'],
        ])->assertOk()
            ->assertJsonPath('discount_max_percent', 15)
            ->assertJsonPath('discount_approval_required', true);

        $this->assertSame('15', SiteSetting::get('discount_max_percent'));
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'discounts.controls.updated',
            'user_id' => $this->manager->id,
        ]);
    }

    public function test_gated_by_permission(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $this->getJson('/api/admin/discounts/controls')->assertForbidden();
        $this->patchJson('/api/admin/discounts/controls', [
            'discount_max_percent' => 20,
        ])->assertForbidden();
    }

    public function test_patch_rejects_invalid_percent(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);

        $this->patchJson('/api/admin/discounts/controls', [
            'discount_max_percent' => 150,
        ])->assertStatus(422);
    }
}
