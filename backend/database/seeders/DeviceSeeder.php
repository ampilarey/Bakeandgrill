<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Device;
use Illuminate\Database\Seeder;

class DeviceSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        Device::firstOrCreate(
            ['identifier' => 'POS-001'],
            ['name' => 'POS Terminal 1', 'type' => 'pos', 'is_active' => true],
        );
    }
}
