<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Order;
use App\Models\Shift;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PosMaintenanceApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    public function test_owner_can_preview_maintenance(): void
    {
        $owner = $this->makeOwner();

        Order::factory()->create([
            'status' => 'pending',
            'created_at' => now()->subDays(2),
        ]);

        Sanctum::actingAs($owner, ['staff']);

        $this->getJson('/api/admin/pos/maintenance-preview?older_than_days=1')
            ->assertOk()
            ->assertJsonStructure([
                'older_than_days',
                'open_tickets_total',
                'eligible_count',
                'skipped_count',
                'stale_shifts_count',
                'stale_shifts',
            ])
            ->assertJsonPath('eligible_count', 1);
    }

    public function test_owner_can_cleanup_unpaid_stale_tickets(): void
    {
        $owner = $this->makeOwner();

        $stale = Order::factory()->create([
            'status' => 'held',
            'payment_status' => 'unpaid',
            'created_at' => now()->subDays(3),
        ]);

        Order::factory()->paid()->create([
            'created_at' => now()->subDays(3),
        ]);

        Sanctum::actingAs($owner, ['staff']);

        $this->postJson('/api/admin/pos/cleanup-stale-tickets', [
            'older_than_days' => 1,
            'confirm' => true,
        ])
            ->assertOk()
            ->assertJsonPath('cancelled_count', 1)
            ->assertJsonPath('cancelled_ids.0', $stale->id);

        $this->assertDatabaseHas('orders', [
            'id' => $stale->id,
            'status' => 'cancelled',
        ]);
    }

    public function test_staff_without_website_manage_cannot_run_maintenance(): void
    {
        $staff = $this->makeStaff('staff');
        $staff->revokePermission('website.manage');

        Sanctum::actingAs($staff, ['staff']);

        $this->getJson('/api/admin/pos/maintenance-preview')->assertForbidden();
        $this->postJson('/api/admin/pos/cleanup-stale-tickets', [
            'older_than_days' => 1,
            'confirm' => true,
        ])->assertForbidden();
    }

    public function test_preview_includes_stale_shifts(): void
    {
        $owner = $this->makeOwner();
        $device = $this->makeDevice('pos');

        Shift::create([
            'user_id' => $owner->id,
            'device_id' => $device->id,
            'opened_at' => now()->subHours(30),
            'opening_cash' => 100,
        ]);

        Sanctum::actingAs($owner, ['staff']);

        $this->getJson('/api/admin/pos/maintenance-preview')
            ->assertOk()
            ->assertJsonPath('stale_shifts_count', 1);
    }
}
