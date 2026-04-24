<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Category;
use App\Models\Item;
use App\Models\MenuGroup;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Item>
 */
class ItemFactory extends Factory
{
    protected $model = Item::class;

    public function definition(): array
    {
        $name = fake()->unique()->words(2, true);

        return [
            'category_id' => Category::factory(),
            'name' => ucwords($name),
            'sku' => strtoupper(Str::random(4)) . '-' . fake()->unique()->randomNumber(4),
            'base_price' => fake()->randomFloat(2, 5, 80),
            'is_active' => true,
            'is_available' => true,
            'track_stock' => false,
            'availability_type' => 'made_to_order',
            'stock_quantity' => 0,
            'has_variants' => false,
        ];
    }

    /**
     * A prepared (stock-tracked) item with a given stock level.
     */
    public function prepared(int $stock = 10): static
    {
        return $this->state(fn () => [
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => $stock,
            'low_stock_threshold' => 2,
        ]);
    }

    /**
     * Made-to-order item (no stock tracking).
     */
    public function madeToOrder(): static
    {
        return $this->state(fn () => [
            'track_stock' => false,
            'availability_type' => 'made_to_order',
        ]);
    }

    public function unavailable(): static
    {
        return $this->state(fn () => ['is_available' => false]);
    }

    public function inactive(): static
    {
        return $this->state(fn () => ['is_active' => false]);
    }

    public function withMenuGroup(): static
    {
        return $this->state(fn () => [
            'menu_group_id' => MenuGroup::firstOrCreate(
                ['slug' => 'default'],
                ['name' => 'Default', 'is_active' => true],
            )->id,
        ]);
    }
}
