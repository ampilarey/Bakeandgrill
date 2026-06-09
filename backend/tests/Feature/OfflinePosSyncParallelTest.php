<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Offline sync idempotency when the same offline_id appears twice in one batch.
 */
class OfflinePosSyncParallelTest extends TestCase
{
    use RefreshDatabase;

    public function test_batch_with_duplicate_offline_id_creates_single_order(): void
    {
        PermissionCatalogSync::sync();

        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $staff = User::create([
            'name' => 'Parallel Staff',
            'email' => 'parallel-offline@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $device = Device::create([
            'name' => 'Parallel POS',
            'identifier' => 'PAR-OFF-1',
            'type' => 'pos',
            'is_active' => true,
        ]);

        $category = Category::create(['name' => 'Parallel Food', 'slug' => 'par-food', 'is_active' => true]);
        $item = Item::create([
            'category_id' => $category->id,
            'name' => 'Parallel Burger',
            'base_price' => 50.0,
            'sku' => 'PAR-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        Sanctum::actingAs($staff, ['staff']);

        $shiftResponse = $this->withHeader('X-Device-Identifier', $device->identifier)
            ->postJson('/api/shifts/open', ['opening_cash' => 100])
            ->assertCreated();
        $shiftId = (int) $shiftResponse->json('shift.id');

        $createResponse = $this->withHeader('X-Device-Identifier', $device->identifier)
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => $item->id, 'quantity' => 1]],
            ])
            ->assertCreated();

        $totals = [
            'subtotal' => (float) $createResponse->json('order.subtotal'),
            'tax' => (float) $createResponse->json('order.tax_amount'),
            'total' => (float) $createResponse->json('order.total'),
        ];

        $offlineId = (string) Str::uuid();
        $payload = [
            'local_order_id' => $offlineId,
            'idempotency_key' => $offlineId,
            'local_order_number' => 'PAR-OFF-0001',
            'device_identifier' => $device->identifier,
            'shift_id' => $shiftId,
            'created_at_local' => now()->toIso8601String(),
            'type' => 'takeaway',
            'items' => [
                [
                    'item_id' => $item->id,
                    'quantity' => 1,
                    'unit_price' => 50.0,
                ],
            ],
            'totals' => $totals,
            'payment' => [
                'method' => 'cash',
                'amount' => $totals['total'],
            ],
        ];

        $response = $this->withHeader('X-Device-Identifier', $device->identifier)
            ->postJson('/api/pos/offline-sync', ['orders' => [$payload, $payload]])
            ->assertOk();

        $results = $response->json('results');
        $this->assertCount(2, $results);
        $this->assertSame('synced', $results[0]['status']);
        $this->assertSame('synced', $results[1]['status']);
        $this->assertSame($results[0]['server_order_id'], $results[1]['server_order_id']);

        $orderId = (int) $results[0]['server_order_id'];
        $this->assertSame(1, Order::where('offline_id', $offlineId)->count());
        $this->assertSame(1, Payment::where('order_id', $orderId)->count());
    }
}
