<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Category;
use App\Models\Item;
use App\Models\Modifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerOrderSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        
        // Seed test data
        $category = Category::create([
            'name' => 'Food',
            'slug' => 'food',
            'is_active' => true,
        ]);
        
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Test Burger',
            'sku' => 'TEST-001',
            'base_price' => 50.00,
            'is_active' => true,
            'is_available' => true,
        ]);
        
        $this->modifier = Modifier::create([
            'name' => 'Extra Cheese',
            'price' => 10.00,
        ]);
        
        $this->item->modifiers()->attach($this->modifier->id);
        
        $this->customer = Customer::create([
            'phone' => '+9607654321',
            'name' => 'Test Customer',
            'loyalty_points' => 0,
            'tier' => 'bronze',
        ]);
    }

    /** @test */
    public function customer_order_requires_item_id()
    {
        $token = $this->customer->createToken('test', ['customer'])->plainTextToken;

        $response = $this->postJson('/api/customer/orders', [
            'items' => [
                [
                    // Missing item_id - should be rejected
                    'quantity' => 1,
                ],
            ],
        ], [
            'Authorization' => "Bearer {$token}",
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['items.0.item_id']);
    }

    /** @test */
    public function customer_order_ignores_client_provided_prices()
    {
        $token = $this->customer->createToken('test', ['customer'])->plainTextToken;

        // Try to tamper with price - send 0.01 instead of actual price
        $response = $this->postJson('/api/customer/orders', [
            'items' => [
                [
                    'item_id' => $this->item->id,
                    'quantity' => 2,
                    'price' => 0.01, // IGNORED - server computes from DB
                    'modifiers' => [
                        [
                            'modifier_id' => $this->modifier->id,
                            'price' => 0.01, // IGNORED - server computes from DB
                        ],
                    ],
                ],
            ],
        ], [
            'Authorization' => "Bearer {$token}",
        ]);

        $response->assertStatus(201);
        $order = $response->json('order');

        // Verify server computed correct total: (50 + 10) * 2 = 120
        $this->assertEquals(120.00, $order['total']);
        $this->assertEquals(120.00, $order['subtotal']);
    }

    /** @test */
    public function customer_order_rejects_invalid_item_id()
    {
        $token = $this->customer->createToken('test', ['customer'])->plainTextToken;

        $response = $this->postJson('/api/customer/orders', [
            'items' => [
                [
                    'item_id' => 99999, // Non-existent item
                    'quantity' => 1,
                ],
            ],
        ], [
            'Authorization' => "Bearer {$token}",
        ]);

        $response->assertStatus(422);
    }

    /** @test */
    public function customer_order_rejects_modifier_not_belonging_to_item()
    {
        $token = $this->customer->createToken('test', ['customer'])->plainTextToken;
        
        // Create another item without this modifier
        $otherItem = Item::create([
            'category_id' => $this->item->category_id,
            'name' => 'Other Item',
            'sku' => 'OTHER-001',
            'base_price' => 30.00,
            'is_active' => true,
            'is_available' => true,
        ]);

        $response = $this->postJson('/api/customer/orders', [
            'items' => [
                [
                    'item_id' => $otherItem->id,
                    'quantity' => 1,
                    'modifiers' => [
                        [
                            'modifier_id' => $this->modifier->id, // Doesn't belong to otherItem
                        ],
                    ],
                ],
            ],
        ], [
            'Authorization' => "Bearer {$token}",
        ]);

        $response->assertStatus(500); // Should throw InvalidArgumentException
        $this->assertStringContainsString('not valid for item', $response->json('message') ?? '');
    }

    /** @test */
    public function staff_token_cannot_access_customer_routes()
    {
        $staff = \App\Models\User::factory()->create();
        $staffToken = $staff->createToken('staff', ['staff'])->plainTextToken;

        $response = $this->getJson('/api/customer/me', [
            'Authorization' => "Bearer {$staffToken}",
        ]);

        $response->assertStatus(403); // Forbidden - missing 'customer' ability
    }

    /** @test */
    public function customer_token_cannot_access_staff_routes()
    {
        $customerToken = $this->customer->createToken('test', ['customer'])->plainTextToken;

        $response = $this->getJson('/api/inventory', [
            'Authorization' => "Bearer {$customerToken}",
        ]);

        $response->assertStatus(403); // Forbidden - missing 'staff' ability
    }
}
