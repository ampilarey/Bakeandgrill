<?php

declare(strict_types=1);

namespace Tests\Unit\Orders;

use App\Domains\Orders\Services\ManualDiscountPolicy;
use App\Domains\Orders\Support\DiscountSettings;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class ManualDiscountPolicyTest extends TestCase
{
    use RefreshDatabase;

    private ManualDiscountPolicy $policy;

    private User $staff;

    private Role $staffRole;

    protected function setUp(): void
    {
        parent::setUp();
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'description' => '', 'is_active' => true]);
        $this->staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $this->staff = User::create([
            'name' => 'Cashier',
            'email' => 'cashier-mdp@test.com',
            'password' => Hash::make('password'),
            'role_id' => $this->staffRole->id,
            'is_active' => true,
        ]);
        $this->staff->grantPermission('promotions.discounts');
        // Most of this suite is about caps and reasons, not about who may
        // give a discount, so the actor is their own approver.
        $this->staff->grantPermission('promotions.discount_override');
        $this->staff->unsetRelation('permissions');
        $this->staff->load('role');

        $this->policy = app(ManualDiscountPolicy::class);
    }

    private function setSetting(string $key, string $value): void
    {
        SiteSetting::set($key, $value);
        SiteSetting::bust();
    }

    public function test_global_switch_off_is_403(): void
    {
        $this->setSetting(DiscountSettings::MANUAL_ENABLED, 'false');

        try {
            $this->policy->authorizeAndClamp($this->staff, 10000, 500, null, null, 1);
            $this->fail('Expected 403');
        } catch (HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());
            $this->assertStringContainsString('disabled', $e->getMessage());
        }
    }

    public function test_no_permission_is_403(): void
    {
        $this->staff->revokePermission('promotions.discounts');
        $this->staff->unsetRelation('permissions');

        try {
            $this->policy->authorizeAndClamp($this->staff, 10000, 500, null, null, 1);
            $this->fail('Expected 403');
        } catch (HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());
        }
    }

    public function test_within_cap_ok_and_audits(): void
    {
        $decision = $this->policy->authorizeAndClamp($this->staff, 10000, 1500, null, null, 42);
        $this->assertSame(1500, $decision->discountLaar);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'order.manual_discount.applied',
            'model_id' => 42,
        ]);
    }

    public function test_above_cap_is_422_hard_ceiling(): void
    {
        $this->setSetting(DiscountSettings::MAX_PERCENT, '10');

        try {
            $this->policy->authorizeAndClamp($this->staff, 10000, 2000, null, null, 1);
            $this->fail('Expected 422');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertStringContainsString('maximum allowed', $e->getMessage());
        }
    }

    public function test_reason_required_missing_is_422(): void
    {
        $this->setSetting(DiscountSettings::REASON_REQUIRED, 'true');
        $this->setSetting(DiscountSettings::REASONS, json_encode(['Loyal customer']));

        try {
            $this->policy->authorizeAndClamp($this->staff, 10000, 500, null, null, 1);
            $this->fail('Expected 422');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertStringContainsString('reason', strtolower($e->getMessage()));
        }
    }

    public function test_per_role_cap_beats_global(): void
    {
        $this->setSetting(DiscountSettings::MAX_PERCENT, '50');
        $this->setSetting(DiscountSettings::ROLE_CAPS, json_encode([
            'staff' => ['percent' => 5],
        ]));

        try {
            $this->policy->authorizeAndClamp($this->staff, 10000, 1000, null, null, 1);
            $this->fail('Expected 422');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }

        $ok = $this->policy->authorizeAndClamp($this->staff, 10000, 500, null, null, 2);
        $this->assertSame(500, $ok->discountLaar);
    }

    public function test_never_exceeds_subtotal(): void
    {
        // Cap includes subtotal — above subtotal is rejected (hard ceiling).
        try {
            $this->policy->authorizeAndClamp($this->staff, 1000, 5000, null, null, 3);
            $this->fail('Expected 422');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }

        $decision = $this->policy->authorizeAndClamp($this->staff, 1000, 1000, null, null, 4);
        $this->assertSame(1000, $decision->discountLaar);
    }

    public function test_zero_discount_skips_checks_and_audit(): void
    {
        $before = AuditLog::count();
        $this->setSetting(DiscountSettings::MANUAL_ENABLED, 'false');
        $decision = $this->policy->authorizeAndClamp($this->staff, 10000, 0, null, null, 1);
        $this->assertSame(0, $decision->discountLaar);
        $this->assertSame($before, AuditLog::count());
    }

    public function test_defaults_allow_up_to_subtotal_for_an_approver(): void
    {
        // Migration defaults: enabled, 100%, fixed 0, reason off. The actor
        // may approve discounts, so the whole subtotal is theirs to give, and
        // the record names them as the approver.
        $decision = $this->policy->authorizeAndClamp($this->staff, 10000, 10000, null, null, 9);
        $this->assertSame(10000, $decision->discountLaar);
        $this->assertSame((int) $this->staff->id, $decision->approvedByUserId);
    }

    /**
     * Owner, 2026-09-02: "a cashier must not apply a random discount any
     * amount without manager/admin approval". The old setting no longer
     * turns this off.
     */
    public function test_a_cashier_without_the_approve_permission_is_blocked_whatever_the_setting_says(): void
    {
        $this->setSetting(DiscountSettings::APPROVAL_REQUIRED, 'false');
        $cashier = User::create([
            'name' => 'Cashier', 'email' => 'cashier-policy@test.com',
            'password' => Hash::make('password'), 'role_id' => $this->staffRole->id,
            'is_active' => true,
        ]);
        $cashier->grantPermission('promotions.discounts');

        try {
            $this->policy->authorizeAndClamp($cashier, 10000, 500, null, null, 1);
            $this->fail('Expected 422');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertStringContainsString('approval', strtolower($e->getMessage()));
        }

        // The same request through the approval path (code confirmed) is fine.
        $decision = $this->policy->authorizeAndClamp($cashier, 10000, 500, null, null, 1, 42, viaApprovalConfirm: true);
        $this->assertSame(500, $decision->discountLaar);
        $this->assertSame(42, $decision->approvedByUserId);
    }
}
