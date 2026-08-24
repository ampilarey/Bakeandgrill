<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use App\Models\AuditLog;
use App\Models\Device;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Device self-registration.
 *
 * Tills are set up in the shop with nobody around to approve them (owner,
 * 2026-08-24), so auto-approval is deliberate and most of these tests exist to
 * keep it working — including under `POS_STRICT_DEVICE_APPROVAL`, which
 * defaults to TRUE and gates EnsureActiveDevice. That asymmetry is what makes
 * a new till usable at all: the middleware parks it pending, this endpoint
 * approves it moments later.
 *
 * Device approval is therefore an inventory of terminals, not an access
 * control. The real gate is the staff token needed to reach this endpoint. So
 * what is pinned here is the part that can be tightened without breaking the
 * shop: a rejected device stays rejected, and a self-promotion is auditable.
 */
class DeviceSelfRegistrationTest extends TestCase
{
    use RefreshDatabase;

    private function staff(): User
    {
        $role = Role::firstOrCreate(['slug' => 'cashier'], ['name' => 'Cashier', 'is_active' => true]);

        return User::factory()->create(['role_id' => $role->id, 'is_active' => true]);
    }

    private function register(string $identifier = 'TILL-1'): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/devices/self-register', [
            'name' => 'Front counter',
            'identifier' => $identifier,
            'type' => 'pos',
        ]);
    }

    public function test_a_new_till_onboards_itself(): void
    {
        // The shop's actual workflow. If this breaks, a new terminal cannot
        // sell until someone logs into admin — which is the whole reason
        // auto-approval exists.
        Sanctum::actingAs($this->staff(), ['staff']);

        $this->register()->assertOk()->assertJsonPath('status', 'approved');

        $this->assertSame('approved', Device::where('identifier', 'TILL-1')->value('status'));
    }

    public function test_it_onboards_even_with_strict_approval_on(): void
    {
        // Deliberate, and the reason the owner sees "not registered, refresh
        // and it opens": strict mode gates EnsureActiveDevice, which parks the
        // device pending, and this endpoint approves it moments later. Gating
        // this on the same flag would leave a new till dead until someone
        // logged into admin.
        config(['pos.strict_device_approval' => true]);
        Sanctum::actingAs($this->staff(), ['staff']);

        $this->register('TILL-STRICT')->assertOk()->assertJsonPath('status', 'approved');

        $this->assertSame('approved', Device::where('identifier', 'TILL-STRICT')->value('status'));
    }

    public function test_a_rejected_device_is_never_resurrected(): void
    {
        // Rejecting a terminal has to be final in both modes, or "revoke this
        // till" means nothing. This is the one real control the endpoint has.
        foreach ([false, true] as $strict) {
            config(['pos.strict_device_approval' => $strict]);
            $identifier = 'TILL-REJECTED-' . ($strict ? 'S' : 'L');
            Device::create([
                'name' => 'Stolen till',
                'identifier' => $identifier,
                'type' => 'pos',
                'status' => 'rejected',
                'is_active' => false,
            ]);
            Sanctum::actingAs($this->staff(), ['staff']);

            $this->register($identifier)->assertOk();

            $this->assertSame(
                'rejected',
                Device::where('identifier', $identifier)->value('status'),
                'a rejected device must stay rejected (strict=' . var_export($strict, true) . ')',
            );
        }
    }

    public function test_a_self_promotion_is_written_to_the_audit_log(): void
    {
        // "A device an admin parked became approved by itself" is exactly the
        // event you want to be able to find afterwards. It was silent before,
        // and visibility is what this endpoint can offer instead of a gate.
        Device::create([
            'name' => 'Parked till',
            'identifier' => 'TILL-PROMOTE',
            'type' => 'pos',
            'status' => 'pending',
            'is_active' => false,
        ]);
        $staff = $this->staff();
        Sanctum::actingAs($staff, ['staff']);

        $this->register('TILL-PROMOTE')->assertOk()->assertJsonPath('status', 'approved');

        $this->assertTrue(
            AuditLog::where('action', 'device.self_approved')->exists(),
            'the promotion must be auditable',
        );
    }

    public function test_registration_still_requires_a_staff_token(): void
    {
        // Unauthenticated registration would let anyone mint a till.
        $this->register('TILL-ANON')->assertUnauthorized();
        $this->assertNull(Device::where('identifier', 'TILL-ANON')->first());
    }
}
