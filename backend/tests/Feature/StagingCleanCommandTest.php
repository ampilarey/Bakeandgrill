<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class StagingCleanCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_staging_clean_removes_orders_and_customers_but_keeps_menu_and_staff(): void
    {
        $staff = User::factory()->create();
        $customer = Customer::factory()->create();
        $category = Category::create(['name' => 'Test', 'slug' => 'test', 'is_active' => true]);
        $item = Item::create([
            'category_id' => $category->id,
            'name' => 'Burger',
            'base_price' => 10,
            'sku' => 'TST-1',
            'barcode' => 'TST-1',
            'is_active' => true,
            'is_available' => true,
        ]);
        Order::create([
            'order_number' => 'BG-20260522-0001',
            'type' => 'takeaway',
            'status' => 'completed',
            'customer_id' => $customer->id,
            'user_id' => $staff->id,
            'subtotal' => 10,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 10,
        ]);

        $exit = Artisan::call('staging:clean', ['--force' => true]);

        $this->assertSame(0, $exit);
        $this->assertSame(0, Order::count());
        $this->assertSame(0, Customer::count());
        $this->assertSame(1, User::count());
        $this->assertSame(1, Item::count());
        $this->assertSame(1, Category::count());
    }
}
