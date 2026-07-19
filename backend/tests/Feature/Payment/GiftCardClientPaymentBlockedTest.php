<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * gift_card payment rows are minted server-side from soft-holds only.
 * Client POSTs with method=gift_card must never settle an order.
 */
class GiftCardClientPaymentBlockedTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;

    private Device $device;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => 'Owner', 'is_active' => true],
        );

        $this->staff = User::create([
            'name' => 'Gift Tender Staff',
            'email' => 'gift-tender@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->device = Device::create([
            'name' => 'Gift Tender POS',
            'identifier' => 'GIFT-TENDER-POS',
            'type' => 'pos',
            'is_active' => true,
        ]);

        $this->item = Item::factory()->create(['base_price' => 25.0]);
    }

    public function test_client_posted_gift_card_payment_is_rejected(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $orderId = $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'device_identifier' => $this->device->identifier,
                'print' => false,
                'items' => [
                    ['item_id' => $this->item->id, 'name' => $this->item->name, 'quantity' => 1],
                ],
            ])
            ->assertCreated()
            ->json('order.id');

        $response = $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [
                    ['method' => 'gift_card', 'amount' => 25.0],
                ],
                'print_receipt' => false,
            ]);

        $response->assertStatus(422);

        $order = Order::findOrFail($orderId);
        $this->assertNotSame('paid', $order->status);
        $this->assertSame(0, Payment::query()->where('order_id', $orderId)->count());
    }

    public function test_soft_held_gift_card_settles_with_cash_remainder_once(): void
    {
        ['card' => $card, 'code' => $code] = $this->makeGiftCard([
            'initial_balance' => 20,
            'current_balance' => 20,
        ]);

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $orderId = $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'device_identifier' => $this->device->identifier,
                'print' => false,
                'items' => [
                    ['item_id' => $this->item->id, 'name' => $this->item->name, 'quantity' => 1],
                ],
            ])
            ->assertCreated()
            ->json('order.id');

        $this->postJson(
            "/api/pos/orders/{$orderId}/gift-card",
            ['code' => $code],
            $this->staffHeaders($this->staff),
        )->assertOk();

        $order = Order::findOrFail($orderId);
        $giftLaar = (int) $order->gift_card_discount_laar;
        $this->assertGreaterThan(0, $giftLaar);
        $orderTotal = (float) $order->total;
        $remainder = round($orderTotal - ($giftLaar / 100), 2);
        $this->assertGreaterThan(0, $remainder);

        $idem = 'cash-remainder:' . $orderId;
        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [
                    ['method' => 'cash', 'amount' => $remainder, 'idempotency_key' => $idem],
                ],
                'print_receipt' => false,
            ])
            ->assertOk();

        $order->refresh();
        $this->assertSame('paid', $order->status);

        $giftRows = Payment::query()
            ->where('order_id', $orderId)
            ->where('method', 'gift_card')
            ->get();
        $this->assertCount(1, $giftRows);
        $this->assertSame('gift_card:tender:' . $orderId, $giftRows->first()->idempotency_key);
        $this->assertSame($giftLaar, (int) $giftRows->first()->amount_laar);

        $cashRows = Payment::query()
            ->where('order_id', $orderId)
            ->where('method', 'cash')
            ->get();
        $this->assertCount(1, $cashRows);

        $card->refresh();
        $this->assertEqualsWithDelta(0.0, (float) $card->current_balance, 0.001);

        // Replay must not duplicate the internal gift_card tender row.
        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [
                    ['method' => 'cash', 'amount' => $remainder, 'idempotency_key' => $idem],
                ],
                'print_receipt' => false,
            ])
            ->assertOk();

        $this->assertSame(
            1,
            Payment::query()->where('order_id', $orderId)->where('method', 'gift_card')->count(),
        );
        $this->assertSame(
            1,
            Payment::query()->where('order_id', $orderId)->where('method', 'cash')->count(),
        );
    }
}
