<?php

namespace Database\Seeders;

use App\Models\RestaurantTable;
use Illuminate\Database\Seeder;

class RestaurantTableSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        for ($i = 1; $i <= 10; $i++) {
            RestaurantTable::firstOrCreate(
                ['name' => 'T' . $i],
                ['capacity' => 2, 'status' => 'available']
            );
        }
    }
}
