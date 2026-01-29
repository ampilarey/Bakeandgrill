<?php

namespace Database\Seeders;

use App\Models\Printer;
use Illuminate\Database\Seeder;

class PrinterSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $printers = [
            ['name' => 'Kitchen Printer', 'ip_address' => '192.168.1.50', 'type' => 'kitchen'],
            ['name' => 'Bar Printer', 'ip_address' => '192.168.1.51', 'type' => 'bar'],
            ['name' => 'Counter Printer', 'ip_address' => '192.168.1.52', 'type' => 'counter'],
        ];

        foreach ($printers as $printer) {
            Printer::firstOrCreate(
                ['ip_address' => $printer['ip_address']],
                [
                    'name' => $printer['name'],
                    'type' => $printer['type'],
                    'port' => 9100,
                    'is_active' => true,
                ]
            );
        }
    }
}
