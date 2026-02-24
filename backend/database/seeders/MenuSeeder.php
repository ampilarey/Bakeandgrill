<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Item;
use Illuminate\Database\Seeder;

class MenuSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $food = Category::firstOrCreate(['name' => 'Food'], ['slug' => 'food']);
        $drinks = Category::firstOrCreate(['name' => 'Drinks'], ['slug' => 'drinks']);

        Item::firstOrCreate(
            ['name' => 'Chicken Burger'],
            [
                'category_id' => $food->id,
                'description' => 'Grilled chicken burger with fresh salad',
                'sku' => 'FOOD-001',
                'base_price' => 45.00,
                'tax_rate' => 0,
                'is_active' => true,
            ],
        );

        Item::firstOrCreate(
            ['name' => 'French Fries'],
            [
                'category_id' => $food->id,
                'description' => 'Crispy fries',
                'sku' => 'FOOD-002',
                'base_price' => 20.00,
                'tax_rate' => 0,
                'is_active' => true,
            ],
        );

        Item::firstOrCreate(
            ['name' => 'Iced Coffee'],
            [
                'category_id' => $drinks->id,
                'description' => 'Cold brew iced coffee',
                'sku' => 'DRINK-001',
                'base_price' => 25.00,
                'tax_rate' => 0,
                'is_active' => true,
            ],
        );
    }
}
