<?php

declare(strict_types=1);

namespace Tests\Contract;

use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Printer;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

/**
 * Contract tests for the print proxy payload shape.
 *
 * This is the most critical contract: the payload sent to the print proxy
 * MUST never change shape, as it drives physical printers.
 * Any accidental change would break printing in production.
 */
class PrintPayloadContractTest extends ContractTestCase
{
    private User $staff;
    private Device $device;
    private Item $item;
    private Printer $kitchenPrinter;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::create(['name' => 'Cashier', 'slug' => 'cashier', 'description' => '', 'is_active' => true]);

        $this->staff = User::create([
            'name' => 'Test Cashier',
            'email' => 'cashier@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->device = Device::create([
            'name' => 'POS-01',
            'identifier' => 'TEST-001',
            'type' => 'pos',
            'is_active' => true,
        ]);

        $category = Category::create(['name' => 'Food', 'slug' => 'food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Grilled Chicken',
            'base_price' => 25.00,
            'sku' => 'GRL-001',
            'barcode' => 'GRL-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->kitchenPrinter = Printer::create([
            'name' => 'Kitchen',
            'ip_address' => '192.168.1.100',
            'port' => 9100,
            'type' => 'kitchen',
            'station' => 'kitchen',
            'is_active' => true,
        ]);
    }

    public function test_kitchen_print_job_payload_shape(): void
    {
        Http::fake([
            '*' => Http::response(['ok' => true], 200),
        ]);

        Sanctum::actingAs($this->staff, ['staff']);

        $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'print' => true,
            'items' => [['item_id' => $this->item->id, 'quantity' => 2]],
        ]);

        Http::assertSent(function ($request) {
            $payload = $request->data();

            $this->assertArrayHasKey('printer_name', $payload, 'Print payload missing printer_name');
            $this->assertArrayHasKey('type', $payload, 'Print payload missing type');
            $this->assertArrayHasKey('printer', $payload, 'Print payload missing printer');
            $this->assertArrayHasKey('order', $payload, 'Print payload missing order');

            $printer = $payload['printer'];
            $this->assertArrayHasKey('id', $printer);
            $this->assertArrayHasKey('name', $printer);
            $this->assertArrayHasKey('ip_address', $printer);
            $this->assertArrayHasKey('port', $printer);
            $this->assertArrayHasKey('type', $printer);
            $this->assertArrayHasKey('station', $printer);

            $order = $payload['order'];
            $this->assertArrayHasKey('id', $order);
            $this->assertArrayHasKey('order_number', $order);
            $this->assertArrayHasKey('type', $order);
            $this->assertArrayHasKey('notes', $order);
            $this->assertArrayHasKey('created_at', $order);
            $this->assertArrayHasKey('items', $order);

            $item = $order['items'][0];
            $this->assertArrayHasKey('id', $item);
            $this->assertArrayHasKey('item_name', $item);
            $this->assertArrayHasKey('quantity', $item);
            $this->assertArrayHasKey('modifiers', $item);

            return true;
        });
    }

    public function test_receipt_print_job_payload_shape(): void
    {
        Http::fake([
            '*' => Http::response(['ok' => true], 200),
        ]);

        Printer::create([
            'name' => 'Counter',
            'ip_address' => '192.168.1.101',
            'port' => 9100,
            'type' => 'receipt',
            'station' => 'counter',
            'is_active' => true,
        ]);

        Sanctum::actingAs($this->staff, ['staff']);

        $createResponse = $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ]);

        $orderId = $createResponse->json('order.id');
        $total = $createResponse->json('order.total');

        $this->postJson("/api/orders/{$orderId}/payments", [
            'payments' => [['method' => 'cash', 'amount' => $total]],
            'print_receipt' => true,
        ]);

        Http::assertSent(function ($request) {
            $payload = $request->data();
            if (!isset($payload['order']['subtotal'])) {
                return false;
            }

            $order = $payload['order'];
            $this->assertArrayHasKey('subtotal', $order, 'Receipt payload missing subtotal');
            $this->assertArrayHasKey('tax_amount', $order, 'Receipt payload missing tax_amount');
            $this->assertArrayHasKey('discount_amount', $order, 'Receipt payload missing discount_amount');
            $this->assertArrayHasKey('total', $order, 'Receipt payload missing total');
            $this->assertArrayHasKey('payments', $order, 'Receipt payload missing payments');

            return true;
        });
    }
}
