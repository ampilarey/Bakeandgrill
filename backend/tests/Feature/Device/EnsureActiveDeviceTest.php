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
        config(['pos.strict_device_approval' => false]);

        $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])
            ->assertCreated();

        $this->assertDatabaseCount('devices', 0);
    }
}
