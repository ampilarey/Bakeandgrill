<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Customer;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * @extends Factory<Customer>
 */
class CustomerFactory extends Factory
{
    protected $model = Customer::class;

    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'phone' => '+960' . fake()->unique()->numerify('#######'),
            'email' => fake()->unique()->safeEmail(),
            'is_active' => true,
            'tier' => 'bronze',
            'loyalty_points' => 0,
            'sms_opt_out' => false,
        ];
    }

    public function withPassword(string $password = 'password'): static
    {
        return $this->state(fn () => ['password' => Hash::make($password)]);
    }

    public function bronze(): static
    {
        return $this->state(fn () => ['tier' => 'bronze', 'loyalty_points' => 0]);
    }

    public function silver(): static
    {
        return $this->state(fn () => ['tier' => 'silver', 'loyalty_points' => 200]);
    }

    public function gold(): static
    {
        return $this->state(fn () => ['tier' => 'gold', 'loyalty_points' => 500]);
    }

    public function inactive(): static
    {
        return $this->state(fn () => ['is_active' => false]);
    }
}
