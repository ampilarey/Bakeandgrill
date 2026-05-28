<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\OfflineSyncRecord;
use App\Models\Order;
use App\Models\OrderPromotion;
use App\Models\Payment;
use App\Models\Promotion;
use App\Models\Role;
use App\Models\Shift;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OfflinePosSyncTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;

    private Device $device;

    private Item $item;

    private Shift $shift;

    /** @var array{subtotal: float, tax: float, total: float} */
    private array $referenceTotals;

    protected function setUp(): void
    {
        parent::setUp();

        PermissionCatalogSync::sync();

        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);

        $this->staff = User::create([
            'name' => 'Offline Staff',
            'email' => 'offline-staff@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->device = Device::create([
            'name' => 'Offline POS',
            'identifier' => 'OFFLINE-POS-1',
            'type' => 'pos',
            'is_active' => true,
        ]);

        $category = Category::create(['name' => 'Offline Food', 'slug' => 'offline-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Offline Burger',
            'base_price' => 50.0,
            'sku' => 'OFF-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        Sanctum::actingAs($this->staff, ['staff']);

        $shiftResponse = $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson('/api/shifts/open', ['opening_cash' => 100]);
        $shiftResponse->assertCreated();
        $this->shift = Shift::findOrFail((int) $shiftResponse->json('shift.id'));
        $this->referenceTotals = $this->computeReferenceTotals();
    }

    public function test_sync_creates_order_with_cash_payment_and_shift_link(): void
    {
        $payload = $this->buildOrderPayload('cash', 50.0);

        $response = $this->syncPayload([$payload]);

        $response->assertOk()
            ->assertJsonPath('results.0.status', 'synced');

        $orderId = (int) $response->json('results.0.server_order_id');
        $order = Order::findOrFail($orderId);

        $this->assertSame('paid', $order->status);
        $this->assertSame($payload['idempotency_key'], $order->offline_id);
        $this->assertSame($payload['local_order_number'], $order->offline_local_number);
        $this->assertSame($this->shift->id, (int) $order->shift_id);

        $payment = Payment::where('order_id', $orderId)->firstOrFail();
        $this->assertSame('cash', $payment->method);
        $this->assertSame($this->shift->id, (int) $payment->shift_id);
        $this->assertSame('offline:pay:' . $payload['idempotency_key'], $payment->idempotency_key);
    }

    public function test_sync_creates_order_with_card_payment_without_shift_on_payment(): void
    {
        $payload = $this->buildOrderPayload('card', 50.0, reference: 'TERM-1234');

        $response = $this->syncPayload([$payload]);
        $response->assertOk()->assertJsonPath('results.0.status', 'synced');

        $orderId = (int) $response->json('results.0.server_order_id');
        $payment = Payment::where('order_id', $orderId)->firstOrFail();

        $this->assertSame('card', $payment->method);
        $this->assertSame('TERM-1234', $payment->reference_number);
        $this->assertSame($this->shift->id, (int) $payment->shift_id);
    }

    public function test_sync_creates_order_with_bank_transfer_and_reference(): void
    {
        $payload = $this->buildOrderPayload('bank_transfer', 50.0, reference: 'REF-9988');

        $response = $this->syncPayload([$payload]);
        $response->assertOk()->assertJsonPath('results.0.status', 'synced');

        $payment = Payment::where('order_id', (int) $response->json('results.0.server_order_id'))->firstOrFail();
        $this->assertSame('bank_transfer', $payment->method);
        $this->assertSame('REF-9988', $payment->reference_number);
    }

    public function test_idempotent_replay_returns_existing_order(): void
    {
        $payload = $this->buildOrderPayload('cash', 50.0);

        $first = $this->syncPayload([$payload]);
        $first->assertOk()->assertJsonPath('results.0.status', 'synced');
        $firstOrderId = (int) $first->json('results.0.server_order_id');

        $second = $this->syncPayload([$payload]);
        $second->assertOk()
            ->assertJsonPath('results.0.status', 'synced')
            ->assertJsonPath('results.0.server_order_id', $firstOrderId);

        $this->assertSame(1, Order::where('offline_id', $payload['idempotency_key'])->count());
        $this->assertSame(1, Payment::where('idempotency_key', 'offline:pay:' . $payload['idempotency_key'])->count());
    }

    public function test_rejects_house_account_payment_method(): void
    {
        $payload = $this->buildOrderPayload('house_account', 50.0);

        $this->syncPayload([$payload])
            ->assertUnprocessable();
    }

    public function test_rejects_bml_payment_method(): void
    {
        $payload = $this->buildOrderPayload('bml', 50.0);

        $this->syncPayload([$payload])
            ->assertUnprocessable();
    }

    public function test_rejects_invalid_shift(): void
    {
        $payload = $this->buildOrderPayload('cash', 50.0);
        $payload['shift_id'] = 999999;

        $response = $this->syncPayload([$payload]);
        $response->assertUnprocessable();
    }

    public function test_rejects_order_created_after_shift_closed(): void
    {
        $this->shift->update(['closed_at' => now()]);

        $payload = $this->buildOrderPayload('cash', 50.0);
        $payload['created_at_local'] = now()->addMinute()->toIso8601String();

        $response = $this->syncPayload([$payload]);
        $response->assertOk()->assertJsonPath('results.0.status', 'conflict');
    }

    public function test_allows_order_within_closed_shift_window(): void
    {
        $openedAt = $this->shift->opened_at->copy();
        $createdAt = $openedAt->copy()->addHour();
        $this->shift->update(['closed_at' => $openedAt->copy()->addHours(2)]);

        $payload = $this->buildOrderPayload('cash', 50.0);
        $payload['created_at_local'] = $createdAt->toIso8601String();

        $response = $this->syncPayload([$payload]);
        $response->assertOk()->assertJsonPath('results.0.status', 'synced');
    }

    public function test_rejects_mismatched_totals(): void
    {
        $payload = $this->buildOrderPayload('cash', 50.0);
        $payload['totals']['total'] = 99.99;

        $response = $this->syncPayload([$payload]);
        $response->assertOk()->assertJsonPath('results.0.status', 'conflict');
    }

    public function test_writes_audit_log_on_successful_sync(): void
    {
        $payload = $this->buildOrderPayload('cash', 50.0);

        $this->syncPayload([$payload])->assertOk();

        $this->assertTrue(
            AuditLog::where('action', 'offline.order.synced')->exists(),
        );
    }

    public function test_same_idempotency_key_with_different_payload_is_conflict(): void
    {
        $payload = $this->buildOrderPayload('cash', 50.0);
        $this->syncPayload([$payload])->assertOk();

        $payload['payment']['amount'] = 49.0;
        $response = $this->syncPayload([$payload]);

        $response->assertOk()->assertJsonPath('results.0.status', 'conflict');

        $record = OfflineSyncRecord::where('idempotency_key', $payload['idempotency_key'])->firstOrFail();
        $this->assertSame('conflict', $record->status);
    }

    public function test_legacy_offline_sync_route_returns_deprecation_headers(): void
    {
        $payload = [
            'offline_id' => (string) Str::uuid(),
            'type' => 'takeaway',
            'items' => [
                [
                    'item_id' => $this->item->id,
                    'quantity' => 1,
                ],
            ],
        ];

        $response = $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson('/api/offline/sync', ['orders' => [$payload]]);

        $response->assertOk()
            ->assertHeader('Deprecation', 'true')
            ->assertHeader('Link', '</api/pos/offline-sync>; rel="successor-version"');
    }

    public function test_duplicate_payment_idempotency_prevents_second_payment_row(): void
    {
        $payload = $this->buildOrderPayload('cash', 50.0);

        $this->syncPayload([$payload])->assertOk();
        $this->syncPayload([$payload])->assertOk();

        $this->assertSame(1, Payment::where('idempotency_key', 'offline:pay:' . $payload['idempotency_key'])->count());
    }

    public function test_offline_sync_deducts_prepared_stock(): void
    {
        $this->item->update([
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => 10,
        ]);

        $payload = $this->buildOrderPayload('cash', 50.0);
        $response = $this->syncPayload([$payload]);
        $response->assertOk()->assertJsonPath('results.0.status', 'synced');

        $orderId = (int) $response->json('results.0.server_order_id');

        $this->assertSame(9, (int) $this->item->fresh()->stock_quantity);
        $this->assertSame(
            1,
            StockMovement::where('reference_type', 'menu_item')
                ->where('reference_id', $this->item->id)
                ->where('type', 'sale')
                ->count(),
        );
    }

    public function test_bank_transfer_payment_method_syncs(): void
    {
        $payload = $this->buildOrderPayload('bank_transfer', 50.0, 'TRF-123');

        $this->syncPayload([$payload])->assertOk()
            ->assertJsonPath('results.0.status', 'synced');

        $orderId = (int) OfflineSyncRecord::where('idempotency_key', $payload['idempotency_key'])->value('server_order_id');
        $payment = Payment::where('order_id', $orderId)->firstOrFail();
        $this->assertSame('bank_transfer', $payment->method);
    }

    public function test_sync_applies_promo_from_rewards_payload(): void
    {
        Promotion::create([
            'name' => 'Offline Save',
            'code' => 'OFF5',
            'type' => 'fixed',
            'discount_value' => 500,
            'is_active' => true,
            'stackable' => false,
        ]);

        $payload = $this->buildOrderPayload('cash', 50.0);
        $payload['rewards'] = ['promo_code' => 'OFF5'];
        $payload['totals'] = $this->computeTotalsWithPromo('OFF5');
        $payload['payment']['amount'] = $payload['totals']['total'];

        $response = $this->syncPayload([$payload]);
        $response->assertOk()->assertJsonPath('results.0.status', 'synced');

        $orderId = (int) $response->json('results.0.server_order_id');
        $order = Order::findOrFail($orderId);

        $this->assertGreaterThan(0, OrderPromotion::where('order_id', $orderId)->count());
        $this->assertLessThan(50.0, (float) $order->total);
    }

    /**
     * @param array<int, array<string, mixed>> $orders
     */
    private function syncPayload(array $orders): \Illuminate\Testing\TestResponse
    {
        return $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson('/api/pos/offline-sync', ['orders' => $orders]);
    }

    /**
     * @return array<string, mixed>
     */
    private function buildOrderPayload(string $method, float $amount, ?string $reference = null): array
    {
        $totals = $this->referenceTotals;

        $id = (string) Str::uuid();

        $payload = [
            'idempotency_key' => $id,
            'local_order_id' => $id,
            'local_order_number' => 'OFF-TEST-20260522-0001',
            'device_identifier' => $this->device->identifier,
            'shift_id' => $this->shift->id,
            'created_at_local' => now()->toIso8601String(),
            'type' => 'takeaway',
            'items' => [
                [
                    'item_id' => $this->item->id,
                    'quantity' => 1,
                    'unit_price' => 50.0,
                ],
            ],
            'totals' => $totals,
            'payment' => [
                'method' => $method,
                'amount' => $amount,
            ],
        ];

        if ($reference !== null) {
            $payload['payment']['reference'] = $reference;
        }

        return $payload;
    }

    /**
     * @return array{subtotal: float, tax: float, total: float}
     */
    private function computeTotalsWithPromo(string $code): array
    {
        $createResponse = $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'device_identifier' => $this->device->identifier,
                'items' => [
                    [
                        'item_id' => $this->item->id,
                        'quantity' => 1,
                    ],
                ],
            ]);

        $createResponse->assertCreated();
        $orderId = (int) $createResponse->json('order.id');

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/apply-promo", ['code' => $code])
            ->assertOk();

        $order = Order::findOrFail($orderId)->fresh();

        return [
            'subtotal' => (float) $order->subtotal,
            'tax' => (float) $order->tax_amount,
            'total' => (float) $order->total,
        ];
    }

    /**
     * @return array{subtotal: float, tax: float, total: float}
     */
    private function computeReferenceTotals(): array
    {
        $createResponse = $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'device_identifier' => $this->device->identifier,
                'items' => [
                    [
                        'item_id' => $this->item->id,
                        'quantity' => 1,
                    ],
                ],
            ]);

        $createResponse->assertCreated();
        $order = $createResponse->json('order');

        return [
            'subtotal' => (float) $order['subtotal'],
            'tax' => (float) $order['tax_amount'],
            'total' => (float) $order['total'],
        ];
    }
}
