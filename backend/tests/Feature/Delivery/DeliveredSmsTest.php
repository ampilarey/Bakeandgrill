<?php

declare(strict_types=1);

namespace Tests\Feature\Delivery;

use App\Domains\Notifications\Listeners\SendCustomerOrderStatusSmsListener;
use App\Domains\Orders\DTOs\OrderStatusChangedData;
use App\Domains\Orders\Events\OrderStatusChanged;
use App\Models\Customer;
use App\Models\Order;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Ops audit, 2026-09-25: the rider's "delivered" tap texts the customer, behind its own switch. */
class DeliveredSmsTest extends TestCase
{
    use RefreshDatabase;

    private function fire(Order $order): void
    {
        app(SendCustomerOrderStatusSmsListener::class)->handle(new OrderStatusChanged(new OrderStatusChangedData(
            orderId: $order->id,
            status: 'delivered',
            customerId: $order->customer_id,
            orderNumber: (string) $order->order_number,
            updatedAt: now()->toIso8601String(),
        )));
    }

    public function test_a_delivered_delivery_order_texts_the_customer_once(): void
    {
        $customer = Customer::create(['name' => 'Dan', 'phone' => '+9607890000', 'is_active' => true]);
        $order = Order::factory()->create(['type' => 'delivery', 'status' => 'delivered', 'customer_id' => $customer->id]);
        $this->fire($order);
        $this->fire($order);

        $logs = SmsLog::where('type', 'customer_order_delivered')->get();
        $this->assertCount(1, $logs);
        $this->assertSame('+9607890000', $logs->first()->to);
        $this->assertStringContainsString("#{$order->order_number} has been delivered", (string) $logs->first()->message);

        $takeaway = Order::factory()->create(['type' => 'takeaway', 'status' => 'delivered', 'customer_id' => $customer->id]);
        $this->fire($takeaway);
        $this->assertSame(1, SmsLog::where('type', 'customer_order_delivered')->count(), 'only online types');

        SiteSetting::set('sms_customer_delivered_enabled', 'false');
        SiteSetting::bust();
        $another = Order::factory()->create(['type' => 'delivery', 'status' => 'delivered', 'customer_id' => $customer->id]);
        $this->fire($another);
        $this->assertSame(1, SmsLog::where('type', 'customer_order_delivered')->count(), 'switch off');
    }
}
