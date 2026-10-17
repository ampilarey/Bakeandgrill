<?php

declare(strict_types=1);

namespace Tests\Feature\Customers;

use App\Domains\Payments\Services\GiftCardCodeService;
use App\Models\Customer;
use App\Models\CustomerDepositAccount;
use App\Models\GiftCard;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** The order app's wallet: a gift card into it, and paying an order from it (iruali import plan, feature 12). */
class CustomerWalletTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $owner = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        User::factory()->create(['role_id' => $owner->id, 'is_active' => true]);
        $this->customer = Customer::create(['name' => 'Aisha', 'phone' => '+9607776666', 'is_active' => true]);
        Sanctum::actingAs($this->customer, ['customer']);
    }

    private function card(float $balance): string
    {
        $codes = app(GiftCardCodeService::class);
        $code = 'ABCD-EFGH-JKLM';
        GiftCard::create(['code_hash' => $codes->hash($code), 'code_last4' => 'JKLM', 'initial_balance' => $balance, 'current_balance' => $balance, 'status' => 'active']);

        return $code;
    }

    public function test_a_gift_card_moves_into_the_wallet_once(): void
    {
        $code = $this->card(150);
        $this->postJson('/api/customer/wallet/gift-card', ['code' => $code])->assertOk()
            ->assertJsonPath('added_laar', 15000)->assertJsonPath('balance_laar', 15000);
        $this->assertSame('depleted', GiftCard::query()->firstOrFail()->status);
        $this->postJson('/api/customer/wallet/gift-card', ['code' => $code])->assertUnprocessable();
    }

    public function test_the_wallet_pays_an_order_only_when_it_covers_it(): void
    {
        $this->postJson('/api/customer/wallet/gift-card', ['code' => $this->card(100)])->assertOk();
        $order = Order::factory()->create(['customer_id' => $this->customer->id, 'type' => 'online_pickup', 'status' => 'payment_pending', 'payment_status' => 'unpaid', 'total' => 120, 'total_laar' => 12000]);
        Payment::query()->where('order_id', $order->id)->delete();

        $this->postJson("/api/customer/orders/{$order->id}/pay-wallet")->assertUnprocessable();
        $this->assertSame(10000, (int) CustomerDepositAccount::query()->value('balance_laar'), 'nothing taken');

        Order::query()->whereKey($order->id)->update(['total' => 80, 'total_laar' => 8000]);
        $this->postJson("/api/customer/orders/{$order->id}/pay-wallet")->assertOk()
            ->assertJsonPath('order.payment_status', 'paid')->assertJsonPath('balance_laar', 2000);
        $this->assertSame('customer_deposit', Payment::query()->where('order_id', $order->id)->value('method'));

        $other = Order::factory()->create(['customer_id' => Customer::create(['name' => 'B', 'phone' => '+9607775555', 'is_active' => true])->id]);
        $this->postJson("/api/customer/orders/{$other->id}/pay-wallet")->assertForbidden();
    }
}
