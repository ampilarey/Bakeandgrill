<?php

declare(strict_types=1);

namespace Tests\Feature\Marketing;

use App\Models\CorporateInquiry;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\Review;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Wave11GrowthTest extends TestCase
{
    use RefreshDatabase;

    public function test_featured_reviews_endpoint(): void
    {
        $customer = Customer::factory()->create();
        $item = Item::factory()->create(['is_available' => true]);
        $order = Order::factory()->create(['customer_id' => $customer->id, 'status' => 'completed']);

        Review::create([
            'customer_id' => $customer->id,
            'item_id' => $item->id,
            'order_id' => $order->id,
            'rating' => 5,
            'comment' => 'Best hedhikaa in Malé!',
            'type' => 'item',
            'status' => 'approved',
            'is_anonymous' => false,
        ]);

        $this->getJson('/api/reviews/featured')
            ->assertOk()
            ->assertJsonPath('reviews.0.rating', 5)
            ->assertJsonPath('reviews.0.comment', 'Best hedhikaa in Malé!');
    }

    public function test_corporate_inquiry_store(): void
    {
        $this->postJson('/api/corporate-inquiries', [
            'contact_name' => 'Aisha',
            'phone' => '7912345',
            'company' => 'Island Tech',
            'headcount' => 25,
            'notes' => 'Office breakfast next Monday',
        ])
            ->assertCreated()
            ->assertJsonPath('inquiry.id', 1);

        $this->assertDatabaseHas('corporate_inquiries', [
            'contact_name' => 'Aisha',
            'company' => 'Island Tech',
            'headcount' => 25,
        ]);
    }

    public function test_admin_can_list_corporate_inquiries(): void
    {
        $owner = $this->makeOwner();
        CorporateInquiry::create([
            'contact_name' => 'Test Lead',
            'phone' => '7999999',
            'status' => 'new',
        ]);

        $this->actingAs($owner)
            ->getJson('/api/admin/customers/corporate-inquiries')
            ->assertOk()
            ->assertJsonPath('data.0.contact_name', 'Test Lead');
    }
}
