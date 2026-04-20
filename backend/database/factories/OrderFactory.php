<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Customer;
use App\Models\Order;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Order>
 */
class OrderFactory extends Factory
{
    protected $model = Order::class;

    private static int $seq = 1;

    public function definition(): array
    {
        $subtotal = fake()->randomFloat(2, 10, 200);
        $tax      = round($subtotal * 0.08, 2);
        $total    = $subtotal + $tax;

        return [
            'order_number'    => 'BG-' . date('Ymd') . '-' . str_pad((string) self::$seq++, 4, '0', STR_PAD_LEFT),
            'tracking_token'  => \Illuminate\Support\Str::random(32),
            'type'            => 'takeaway',
            'status'          => 'pending',
            'customer_id'     => Customer::factory(),
            'subtotal'        => $subtotal,
            'tax_amount'      => $tax,
            'discount_amount' => 0,
            'total'           => $total,
            'total_laar'      => (int) round($total * 100),
            'delivery_fee'    => 0,
            'delivery_fee_laar' => 0,
        ];
    }

    public function takeaway(): static
    {
        return $this->state(fn () => ['type' => 'takeaway']);
    }

    public function onlinePickup(): static
    {
        return $this->state(fn () => ['type' => 'online_pickup']);
    }

    public function delivery(): static
    {
        return $this->state(fn () => [
            'type'                   => 'delivery',
            'delivery_island'        => 'Male',
            'delivery_address_line1' => fake()->streetAddress(),
            'delivery_contact_name'  => fake()->name(),
            'delivery_contact_phone' => '+960' . fake()->numerify('#######'),
            'delivery_fee'           => 20.00,
            'delivery_fee_laar'      => 2000,
        ]);
    }

    public function dineIn(): static
    {
        return $this->state(fn () => ['type' => 'dine_in']);
    }

    public function paid(): static
    {
        return $this->state(fn () => [
            'status'  => 'paid',
            'paid_at' => now(),
        ]);
    }

    public function pending(): static
    {
        return $this->state(fn () => ['status' => 'pending']);
    }

    public function paymentPending(): static
    {
        return $this->state(fn () => ['status' => 'payment_pending']);
    }

    public function cancelled(): static
    {
        return $this->state(fn () => ['status' => 'cancelled']);
    }

    public function forCustomer(Customer $customer): static
    {
        return $this->state(fn () => ['customer_id' => $customer->id]);
    }
}
