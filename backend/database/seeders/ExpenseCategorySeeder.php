<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\ExpenseCategory;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class ExpenseCategorySeeder extends Seeder
{
    public function run(): void
    {
        $categories = [
            ['name' => 'Rent',        'icon' => '🏠'],
            ['name' => 'Utilities',   'icon' => '💡'],
            ['name' => 'Salaries',    'icon' => '👥'],
            ['name' => 'Marketing',   'icon' => '📣'],
            ['name' => 'Maintenance', 'icon' => '🔧'],
            ['name' => 'Supplies',    'icon' => '📦'],
            ['name' => 'Packaging',   'icon' => '🎁'],
            ['name' => 'Cleaning',    'icon' => '🧹'],
            ['name' => 'Transport',   'icon' => '🚚'],
            ['name' => 'Licenses',    'icon' => '📋'],
            ['name' => 'Insurance',   'icon' => '🛡️'],
            ['name' => 'Other',       'icon' => '📂'],
        ];

        foreach ($categories as $cat) {
            ExpenseCategory::firstOrCreate(
                ['slug' => Str::slug($cat['name'])],
                ['name' => $cat['name'], 'icon' => $cat['icon'], 'is_active' => true]
            );
        }
    }
}
