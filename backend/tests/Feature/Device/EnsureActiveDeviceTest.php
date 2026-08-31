<?php

declare(strict_types=1);

namespace Tests\Feature\Device;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EnsureActiveDeviceTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        PermissionCatalogSync::sync();
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);

        $this->staff = User::create([
            'name' => 'Device Staff',
            'email' => 'device-staff@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $category = Category::create(['name' => 'Device Food', 'slug' => 'device-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Device Item',
            'base_price' => 10.0,
            'sku' => 'DEV-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();
    }

    public function test_disabled_device_is_blocked_from_pos_routes(): void
    {
        Device::create([
            'name' => 'Disabled POS',
            'identifier' => 'DISABLED-POS',
            'type' => 'pos',
            'is_active' => false,
            'status' => 'approved',
        ]);

        $this->withHeader('X-Device-Identifier', 'DISABLED-POS')
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ])
            ->assertForbidden()
            ->assertJsonPath('code', 'device_disabled');
    }

    public function test_active_device_can_create_orders(): void
    {
        Device::create([
            'name' => 'Active POS',
            'identifier' => 'ACTIVE-POS',
            'type' => 'pos',
            'is_active' => true,
            'status' => 'approved',
        ]);

        $this->withHeader('X-Device-Identifier', 'ACTIVE-POS')
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ])
            ->assertCreated();
    }

    public function test_strict_device_approval_blocks_pending_device(): void
    {
        config(['pos.strict_device_approval' => true]);

        Device::create([
            'name' => 'Pending POS',
            'identifier' => 'PENDING-POS',
            'type' => 'pos',
            'is_active' => true,
            'status' => 'pending',
        ]);

        $this->withHeader('X-Device-Identifier', 'PENDING-POS')
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ])
            ->assertForbidden()
            ->assertJsonPath('code', 'device_not_approved');
    }

    public function test_pending_pos_device_is_auto_approved_when_strict_mode_off(): void
    {
        config(['pos.strict_device_approval' => false]);

        Device::create([
            'name' => 'Legacy Pending POS',
            'identifier' => 'LEGACY-PENDING-POS',
            'type' => 'pos',
            'is_active' => true,
            'status' => 'pending',
        ]);

        $this->withHeader('X-Device-Identifier', 'LEGACY-PENDING-POS')
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ])
            ->assertCreated();

        $this->assertDatabaseHas('devices', [
            'identifier' => 'LEGACY-PENDING-POS',
            'status' => 'approved',
        ]);
    }

    public function test_missing_device_header_is_allowed_in_relaxed_mode(): void
    {
        config(['pos.strict_device_approval' => false, 'pos.require_device_header' => false]);

        $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])
            ->assertCreated();

        $this->assertDatabaseCount('devices', 0);
    }

    public function test_strict_require_device_header_returns_428_when_missing(): void
    {
        config(['pos.require_device_header' => true]);

        $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])
            ->assertStatus(428)
            ->assertJsonPath('code', 'device_header_required')
            ->assertJsonPath(
                'message',
                'This terminal must identify itself — reopen the POS app.',
            );
    }

    public function test_disabling_device_revokes_pos_token_for_that_device(): void
    {
        config(['pos.require_device_header' => false]);

        // Drop Sanctum::actingAs from setUp so Bearer tokens are actually checked.
        \Illuminate\Support\Facades\Auth::forgetGuards();

        $ownerRole = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        $owner = User::create([
            'name' => 'Device Owner',
            'email' => 'device-owner@test.local',
            'password' => Hash::make('password'),
            'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $device = Device::create([
            'name' => 'Revoke POS',
            'identifier' => 'REVOKE-POS-1',
            'type' => 'pos',
            'is_active' => true,
            'status' => 'approved',
        ]);

        $tokenName = 'staff-pos-' . $this->staff->id . '-REVOKE-POS-1';
        $plain = $this->staff->createToken($tokenName, ['staff'])->plainTextToken;

        // Ensure an open shift for this staff (setUp shift was under actingAs).
        \App\Models\Shift::create([
            'user_id' => $this->staff->id,
            'device_id' => $device->id,
            'opened_at' => now(),
            'opening_cash' => 100,
        ]);

        $this->withHeaders([
            'Authorization' => 'Bearer ' . $plain,
            'X-Device-Identifier' => 'REVOKE-POS-1',
        ])->postJson('/api/orders', [
            'type' => 'takeaway',
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])->assertCreated();

        // Guard caches the previous request's user — clear so the owner token resolves.
        \Illuminate\Support\Facades\Auth::forgetGuards();

        $ownerToken = $owner->createToken('admin', ['staff'])->plainTextToken;
        $this->withHeader('Authorization', 'Bearer ' . $ownerToken)
            ->patchJson('/api/devices/' . $device->id . '/disable')
            ->assertOk();

        $this->assertDatabaseMissing('personal_access_tokens', [
            'name' => $tokenName,
        ]);

        \Illuminate\Support\Facades\Auth::forgetGuards();

        $this->withHeaders([
            'Authorization' => 'Bearer ' . $plain,
            'X-Device-Identifier' => 'REVOKE-POS-1',
        ])->postJson('/api/orders', [
            'type' => 'takeaway',
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])->assertUnauthorized();
    }

    /**
     * Owner, 2026-08-17: "When i login to pos, it says device is not
     * registered but when i refresh it, it opens."
     *
     * Two code paths could create a Device row and they disagreed. This
     * middleware created one inactive+pending whenever APP_ENV was production,
     * then rejected it on the very next line — while /devices/self-register,
     * which the POS fires six seconds after login from the same authenticated
     * staff session, created or patched the same device to approved. So the
     * first request after login always failed and a refresh always worked.
     */
    public function test_a_brand_new_device_is_not_blocked_on_its_first_request_in_production(): void
    {
        // Strict approval is the default now, and the sibling test below covers
        // it. This one is specifically about the relaxed setting: the original
        // bug was a new till being rejected on its first request and working
        // after a refresh, which must stay fixed for anyone running relaxed.
        config(['pos.strict_device_approval' => false]);
        config(['app.env' => 'production']);
        $this->app['env'] = 'production';

        $identifier = 'FRESH-TABLET';
        $this->assertNull(Device::where('identifier', $identifier)->first());

        $response = $this->withHeader('X-Device-Identifier', $identifier)
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ]);

        $response->assertSuccessful();

        // Created to match what self-register would have made it anyway.
        $device = Device::where('identifier', $identifier)->firstOrFail();
        $this->assertTrue((bool) $device->is_active);
        $this->assertSame('approved', $device->status);
    }

    public function test_strict_approval_still_gates_a_brand_new_device(): void
    {
        // The real gate is the setting, not the environment.
        config(['app.env' => 'production', 'pos.strict_device_approval' => true]);
        $this->app['env'] = 'production';

        $response = $this->withHeader('X-Device-Identifier', 'STRICT-TABLET')
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ]);

        $response->assertForbidden()->assertJsonPath('code', 'device_not_approved');

        $device = Device::where('identifier', 'STRICT-TABLET')->firstOrFail();
        $this->assertFalse((bool) $device->is_active);
        $this->assertSame('pending', $device->status);
    }

    public function test_a_never_approved_device_is_not_described_as_disabled(): void
    {
        // "Disabled" sends the owner looking for a switch they never touched.
        Device::create([
            'name' => 'Pending POS',
            'identifier' => 'PENDING-POS',
            'type' => 'pos',
            'is_active' => false,
            'status' => 'pending',
        ]);
        config(['pos.strict_device_approval' => true]);

        $this->withHeader('X-Device-Identifier', 'PENDING-POS')
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ])
            ->assertForbidden()
            ->assertJsonPath('code', 'device_not_approved')
            ->assertJsonPath('message', 'This POS device is waiting for approval. Ask the owner to approve it in Settings → Devices.');
    }

    public function test_a_disabled_device_cannot_run_the_cash_drawer(): void
    {
        // Shift open/close were ungated (2026-08-31): a till whose banner said
        // "disabled" could still open a shift. Now the drawer is gated too.
        Device::create([
            'name' => 'Disabled POS',
            'identifier' => 'DISABLED-DRAWER',
            'type' => 'pos',
            'is_active' => false,
            'status' => 'approved',
        ]);

        // setUp opened a shift; close it so open would otherwise succeed.
        $shiftId = \App\Models\Shift::whereNull('closed_at')->value('id');
        $this->postJson("/api/shifts/{$shiftId}/close", ['closing_cash' => 100])->assertOk();

        $this->withHeader('X-Device-Identifier', 'DISABLED-DRAWER')
            ->postJson('/api/shifts/open', ['opening_cash' => 50])
            ->assertForbidden()
            ->assertJsonPath('code', 'device_disabled');
    }

    public function test_a_pending_device_cannot_open_or_close_a_shift_in_strict_mode(): void
    {
        config(['pos.strict_device_approval' => true]);
        Device::create([
            'name' => 'Pending POS',
            'identifier' => 'PENDING-DRAWER',
            'type' => 'pos',
            'is_active' => false,
            'status' => 'pending',
        ]);

        $shiftId = \App\Models\Shift::whereNull('closed_at')->value('id');

        $this->withHeader('X-Device-Identifier', 'PENDING-DRAWER')
            ->postJson("/api/shifts/{$shiftId}/close", ['closing_cash' => 100])
            ->assertForbidden()
            ->assertJsonPath('code', 'device_not_approved');

        $this->withHeader('X-Device-Identifier', 'PENDING-DRAWER')
            ->postJson('/api/shifts/open', ['opening_cash' => 50])
            ->assertForbidden()
            ->assertJsonPath('code', 'device_not_approved');
    }

    public function test_a_rejected_device_gets_its_own_message_and_owner_reapproval_unblocks_it(): void
    {
        // "Rejected" must not read as "disabled" — the cashier would hunt for
        // a switch that doesn't exist. And the owner (only the owner) can
        // bring a mis-rejected till back via the normal approve endpoint.
        $device = Device::create([
            'name' => 'Rejected POS',
            'identifier' => 'REJECTED-POS',
            'type' => 'pos',
            'is_active' => false,
            'status' => 'rejected',
        ]);

        $order = ['type' => 'takeaway', 'items' => [['item_id' => $this->item->id, 'quantity' => 1]]];

        $this->withHeader('X-Device-Identifier', 'REJECTED-POS')
            ->postJson('/api/orders', $order)
            ->assertForbidden()
            ->assertJsonPath('code', 'device_rejected');

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->patchJson("/api/devices/{$device->id}/approve")->assertOk();

        Sanctum::actingAs($this->staff, ['staff']);
        $this->withHeader('X-Device-Identifier', 'REJECTED-POS')
            ->postJson('/api/orders', $order)
            ->assertCreated();
    }

    public function test_first_blocked_request_on_a_new_device_alerts_the_owner(): void
    {
        // The middleware is usually the first to see a brand-new till in
        // strict mode; the SMS must not wait for self-register.
        config(['pos.strict_device_approval' => true]);
        \App\Models\SiteSetting::set('business_phone', '7820288');
        \App\Models\SiteSetting::bust();

        $this->withHeader('X-Device-Identifier', 'BRAND-NEW-TILL')
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ])
            ->assertForbidden()
            ->assertJsonPath('code', 'device_not_approved');

        $device = Device::where('identifier', 'BRAND-NEW-TILL')->firstOrFail();
        $this->assertSame('pending', $device->status);
        $this->assertSame(
            1,
            \App\Models\SmsLog::where('reference_type', 'device')
                ->where('reference_id', (string) $device->id)
                ->count(),
            'owner gets an approval alert the moment the pending row exists',
        );
    }
}
