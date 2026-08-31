<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use App\Models\AuditLog;
use App\Models\Device;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Device self-registration under MANUAL approval.
 *
 * From 2026-08-24 this endpoint auto-approved unconditionally ("a terminal
 * that cannot sell until someone logs into admin is a terminal that cannot
 * sell"). That made strict approval decorative: on 2026-08-31 a brand-new
 * cashier's own login approved a brand-new iPad seven seconds after sign-in.
 * The owner reversed the decision: under POS_STRICT_DEVICE_APPROVAL a device
 * registers PENDING, the owner is SMS-alerted, and only Admin → Settings →
 * Devices approves it. With strict mode off, setup-time auto-approval stays.
 */
class DeviceSelfRegistrationTest extends TestCase
{
    use RefreshDatabase;

    private function staff(): User
    {
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);

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

    public function test_strict_mode_registers_a_new_till_as_pending_and_alerts_the_owner(): void
    {
        config(['pos.strict_device_approval' => true]);
        SiteSetting::set('business_phone', '7820288');
        SiteSetting::bust();
        Sanctum::actingAs($this->staff(), ['staff']);

        $this->register('TILL-NEW')->assertOk()->assertJsonPath('status', 'pending');

        $device = Device::where('identifier', 'TILL-NEW')->firstOrFail();
        $this->assertSame('pending', $device->status);
        $this->assertFalse((bool) $device->is_active);

        // The owner hears about it by SMS — once, even if the till retries.
        $this->register('TILL-NEW')->assertOk()->assertJsonPath('status', 'pending');
        $alerts = SmsLog::where('reference_type', 'device')
            ->where('reference_id', (string) $device->id)
            ->count();
        $this->assertSame(1, $alerts, 'exactly one approval alert per device per interval');
    }

    public function test_nothing_self_promotes_out_of_pending_in_strict_mode(): void
    {
        // THE 2026-08-31 regression: a parked/pending device must never be
        // approved by a staff login. Only the admin Devices screen approves.
        config(['pos.strict_device_approval' => true]);
        Device::create([
            'name' => 'Parked till',
            'identifier' => 'TILL-PARKED',
            'type' => 'pos',
            'status' => 'pending',
            'is_active' => false,
        ]);
        Sanctum::actingAs($this->staff(), ['staff']);

        $this->register('TILL-PARKED')->assertOk()->assertJsonPath('status', 'pending');

        $this->assertSame('pending', Device::where('identifier', 'TILL-PARKED')->value('status'));
        $this->assertFalse(
            AuditLog::where('action', 'device.self_approved')->exists(),
            'self-approval no longer exists as an action',
        );
    }

    public function test_owner_approval_in_admin_is_what_unblocks_the_till(): void
    {
        config(['pos.strict_device_approval' => true]);
        Sanctum::actingAs($this->staff(), ['staff']);
        $this->register('TILL-WAIT')->assertOk()->assertJsonPath('status', 'pending');
        $device = Device::where('identifier', 'TILL-WAIT')->firstOrFail();

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->patchJson("/api/devices/{$device->id}/approve")->assertOk();

        $device->refresh();
        $this->assertSame('approved', $device->status);
        $this->assertTrue((bool) $device->is_active);
    }

    public function test_setup_mode_still_onboards_a_till_without_approval(): void
    {
        // Strict OFF is the deliberate setup-time convenience — pinned so
        // turning the flag off still lets a shop bootstrap its first tills.
        config(['pos.strict_device_approval' => false]);
        Sanctum::actingAs($this->staff(), ['staff']);

        $this->register('TILL-SETUP')->assertOk()->assertJsonPath('status', 'approved');

        $this->assertSame('approved', Device::where('identifier', 'TILL-SETUP')->value('status'));
        $this->assertSame(0, SmsLog::where('reference_type', 'device')->count(), 'no alert when nothing is pending');
    }

    public function test_a_rejected_device_is_never_resurrected(): void
    {
        // Rejecting a terminal has to be final in both modes, or "revoke this
        // till" means nothing.
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

    public function test_registration_still_requires_a_staff_token(): void
    {
        // Unauthenticated registration would let anyone mint a till.
        $this->register('TILL-ANON')->assertUnauthorized();
        $this->assertNull(Device::where('identifier', 'TILL-ANON')->first());
    }
}
