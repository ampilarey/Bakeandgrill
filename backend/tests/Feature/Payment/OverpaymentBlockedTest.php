<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Device;
use App\Models\Item;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OverpaymentBlockedTest extends TestCase
{
    use RefreshDatabase;

    public function test_add_payments_rejects_overpayment_far_exceeding_balance(): void
    {
        PermissionCatalogSync::sync();

        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => 'Staff role', 'is_active' => true],
        );

        $user = User::create([
            'name' => 'Overpay Staff',
            'email' => 'overpay@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $device = Device::create([
            'name' => 'Overpay POS',
            'identifier' => 'OVERPAY-POS',
            'type' => 'pos',
            'is_active' => true,
        ]);

        $item = Item::factory()->create(['base_price' => 25.0]);

        Sanctum::actingAs($user, ['staff']);

        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $createResponse = $this->withHeader('X-Device-Identifier', $device->identifier)
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'device_identifier' => $device->identifier,
                'items' => [
                    ['item_id' => $item->id, 'name' => $item->name, 'quantity' => 1],
                ],
            ])->assertCreated();

        $orderId = $createResponse->json('order.id');

        $response = $this->withHeader('X-Device-Identifier', $device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [
                    ['method' => 'card', 'amount' => 9999.0],
                ],
                'print_receipt' => false,
            ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('far exceeds remaining balance', (string) $response->json('message'));
    }
}
