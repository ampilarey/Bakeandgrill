<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call([
            RoleSeeder::class,
            DemoUserSeeder::class,
            DeviceSeeder::class,
            PrinterSeeder::class,
            RestaurantTableSeeder::class,
            MenuSeeder::class,
        ]);
    }
}
