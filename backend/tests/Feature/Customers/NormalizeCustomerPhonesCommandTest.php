<?php

declare(strict_types=1);

namespace Tests\Feature\Customers;

use App\Models\GiftCardPurchase;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NormalizeCustomerPhonesCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_normalizes_local_seven_digit_phones(): void
    {
        $customer = $this->makeCustomer(['phone' => '7654321']);

        $this->artisan('customers:normalize-phones')
            ->assertSuccessful();

        $this->assertSame('+9607654321', $customer->fresh()->phone);
    }

    public function test_dry_run_does_not_write(): void
    {
        $customer = $this->makeCustomer(['phone' => '7654321']);

        $this->artisan('customers:normalize-phones', ['--dry-run' => true])
            ->assertSuccessful();

        $this->assertSame('7654321', $customer->fresh()->phone);
    }

    public function test_skips_conflict_when_normalized_phone_exists(): void
    {
        $this->makeCustomer(['phone' => '+9607654321']);
        $dirty = $this->makeCustomer(['phone' => '+9607654999']);
        $dirty->forceFill(['phone' => '9607654321'])->save();

        $this->artisan('customers:normalize-phones')->assertSuccessful();

        $this->assertSame('9607654321', $dirty->fresh()->phone);
    }

    public function test_normalizes_gift_card_purchase_recipient_phone(): void
    {
        $customer = $this->makeCustomer(['phone' => '+9607777001']);

        $order = Order::factory()->pending()->forCustomer($customer)->create([
            'type' => 'gift_card',
            'total' => 100,
        ]);

        $purchase = GiftCardPurchase::create([
            'order_id' => $order->id,
            'purchaser_customer_id' => $customer->id,
            'amount' => 100,
            'recipient_phone' => '7777002',
        ]);

        $this->artisan('customers:normalize-phones')->assertSuccessful();

        $this->assertSame('+9607777002', $purchase->fresh()->recipient_phone);
    }
}
