<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Device;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Device>
 */
class DeviceFactory extends Factory
{
    protected $model = Device::class;

    public function definition(): array
    {
        return [
            'name' => 'Device-' . fake()->unique()->randomNumber(4),
            'identifier' => strtoupper(Str::random(4)) . '-' . fake()->unique()->randomNumber(6),
            'type' => 'pos',
            'is_active' => true,
        ];
    }

    public function pos(): static
    {
        return $this->state(fn () => ['type' => 'pos']);
    }

    public function kds(): static
    {
        return $this->state(fn () => ['type' => 'kds']);
    }

    public function inactive(): static
    {
        return $this->state(fn () => ['is_active' => false]);
    }
}
