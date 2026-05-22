<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Payments\Services\PaymentService;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Receipt;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PosPayLinkTest extends TestCase
{
    use RefreshDatabase;

    private Order $order;
    private User $staffUser;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Food', 'slug' => 'pay-food', 'is_active' => true]);
        $item = Item::create([
            'category_id' => $category->id,
            'name' => 'Pay Link Item',
            'base_price' => 75.0,
            'sku' => 'PL-1',
            'is_active' => true,
            'is_available' => true,
        ]);

        $role = Role::create(['name' => 'Cashier', 'slug' => 'cashier', 'is_active' => true]);
        $this->staffUser = User::create([
            'name' => 'Cashier',
            'email' => 'cashier@paylink.test',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Device::create(['name' => 'PL POS', 'identifier' => 'PL-POS', 'type' => 'pos', 'is_active' => true]);

        $this->customer = Customer::create([
            'name' => 'Pay Customer',
            'phone' => '+9607891234',
            'is_active' => true,
        ]);

        $this->order = Order::create([
            'order_number' => 'PL-2001',
            'type' => 'takeaway',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'subtotal' => 75,
            'total' => 75,
            'total_laar' => 7500,
            'customer_id' => $this->customer->id,
            'user_id' => $this->staffUser->id,
        ]);
        OrderItem::create([
            'order_id' => $this->order->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'unit_price' => 75,
            'quantity' => 1,
            'total_price' => 75,
        ]);
    }

    public function test_send_pay_link_sms_contains_pay_page_not_bml_gateway(): void
    {
        Sanctum::actingAs($this->staffUser, ['staff']);

        $res = $this->postJson("/api/orders/{$this->order->id}/send-pay-link");
        $res->assertOk();
        $res->assertJsonPath('message', 'Pay link sent.');
        $this->assertStringContainsString('/pay/', (string) $res->json('pay_page_url'));

        $this->assertDatabaseHas('sms_logs', [
            'reference_type' => 'order',
            'reference_id' => (string) $this->order->id,
        ]);

        $sms = \App\Models\SmsLog::query()
            ->where('reference_type', 'order')
            ->where('reference_id', (string) $this->order->id)
            ->latest('id')
            ->first();

        $this->assertNotNull($sms);
        $this->assertStringContainsString('/pay/', (string) $sms->message);
        $this->assertStringNotContainsString('merchants.bankofmaldives', (string) $sms->message);
    }

    public function test_pay_page_shows_order_details(): void
    {
        $receipt = Receipt::ensureForOrder($this->order->fresh('customer'));

        $res = $this->get('/pay/' . $receipt->token);
        $res->assertOk();
        $res->assertSee('PL-2001');
        $res->assertSee('Pay Link Item');
        $res->assertSee('75.00');
        $res->assertSee('Terms &amp; Conditions', false);
    }

    public function test_pay_requires_terms_before_bml_redirect(): void
    {
        $receipt = Receipt::ensureForOrder($this->order->fresh('customer'));

        $res = $this->post('/pay/' . $receipt->token, []);
        $res->assertSessionHasErrors('accept_terms');
    }

    public function test_pay_with_terms_redirects_to_bml(): void
    {
        $receipt = Receipt::ensureForOrder($this->order->fresh('customer'));

        $mock = $this->createMock(PaymentService::class);
        $mock->method('getRemainingBalanceLaar')->willReturn(7500);
        $mock->expects($this->once())
            ->method('initiatePartialBmlPayment')
            ->willReturn([
                'payment_url' => 'https://pay.example.test/session/abc',
                'payment_id' => 1,
                'local_id' => 'BGTEST',
            ]);
        $this->app->instance(PaymentService::class, $mock);

        $res = $this->post('/pay/' . $receipt->token, [
            'accept_terms' => '1',
        ]);

        $res->assertRedirect('https://pay.example.test/session/abc');
    }
}
