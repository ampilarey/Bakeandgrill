<?php

declare(strict_types=1);

namespace Tests\Feature\Reviews;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Http\Controllers\Api\ReviewController;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\Review;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Photos, the verified mark, helpful votes and the restaurant's reply (iruali import plan, feature 6). */
class BetterReviewsTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private Order $order;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->customer = Customer::factory()->create(['phone' => '+9607772222']);
        $this->order = Order::factory()->create(['customer_id' => $this->customer->id, 'status' => 'completed']);
    }

    public function test_a_review_keeps_up_to_three_photos_stripped_and_waits_for_staff(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);
        $this->post('/api/reviews', [
            'order_id' => $this->order->id, 'rating' => 5, 'comment' => 'Lovely',
            'photos' => [UploadedFile::fake()->image('a.jpg', 3000, 2000), UploadedFile::fake()->image('b.png', 200, 200)],
        ], ['Accept' => 'application/json'])->assertCreated()
            ->assertJsonPath('review.status', 'pending')
            ->assertJsonPath('review.verified', true)
            ->assertJsonCount(2, 'review.photos');

        $review = Review::query()->firstOrFail();
        [$w] = getimagesizefromstring(Storage::disk('local')->get($review->photos[0]['path']));
        $this->assertSame(1600, $w);
        [$tw] = getimagesizefromstring(Storage::disk('local')->get($review->photos[0]['thumb']));
        $this->assertSame(480, $tw);

        // Not shown to the public before it is approved.
        $this->get("/api/reviews/{$review->id}/photos/0")->assertNotFound();
        $review->update(['status' => 'approved']);
        $this->get("/api/reviews/{$review->id}/photos/0?thumb=1")->assertOk()->assertHeader('Content-Type', 'image/jpeg');

        $this->post('/api/reviews', [
            'order_id' => $this->order->id, 'rating' => 5,
            'photos' => array_fill(0, 4, UploadedFile::fake()->image('c.jpg')),
        ], ['Accept' => 'application/json'])->assertUnprocessable();
    }

    public function test_helpful_counts_once_per_customer_and_sorts_the_list(): void
    {
        $item = Item::factory()->create();
        $plain = $this->review($item, 'Fine');
        $liked = $this->review($item, 'Great', Customer::factory()->create());
        $other = Customer::factory()->create();
        Sanctum::actingAs($other, ['customer']);

        $this->postJson("/api/reviews/{$liked->id}/helpful")->assertOk()->assertJsonPath('helpful_count', 1);
        $this->postJson("/api/reviews/{$liked->id}/helpful")->assertOk()->assertJsonPath('helpful_count', 1);

        $this->getJson("/api/items/{$item->id}/reviews")->assertOk()
            ->assertJsonPath('reviews.0.id', $liked->id)
            ->assertJsonPath('reviews.1.id', $plain->id);

        Sanctum::actingAs(Customer::query()->findOrFail($liked->customer_id), ['customer']);
        $this->postJson("/api/reviews/{$liked->id}/helpful")->assertUnprocessable();
    }

    public function test_the_restaurant_replies_and_the_customer_is_told_once(): void
    {
        $review = $this->review(Item::factory()->create(), 'Too salty');
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->postJson("/api/admin/reviews/{$review->id}/reply", ['reply' => 'Sorry, we will tell the kitchen.'])->assertOk()
            ->assertJsonPath('review.reply.text', 'Sorry, we will tell the kitchen.');
        $this->postJson("/api/admin/reviews/{$review->id}/reply", ['reply' => 'Sorry, we have told the kitchen.'])->assertOk();

        $sent = SmsLog::query()->where('type', ReviewController::TYPE_REPLY)->get();
        $this->assertCount(1, $sent);
        $this->assertStringContainsString('replied to your review', (string) $sent->first()->message);

        $this->getJson("/api/items/{$review->item_id}/reviews")
            ->assertJsonPath('reviews.0.reply.text', 'Sorry, we have told the kitchen.');
    }

    public function test_the_dish_page_shows_reviews_and_the_rating(): void
    {
        $item = Item::factory()->create(['is_active' => true, 'is_available' => true]);
        $review = $this->review($item, 'Crispy and hot');
        $review->forceFill(['reply' => 'Thank you!', 'photos' => [['path' => 'review-photos/x.jpg', 'thumb' => 'review-photos/x-t.jpg']]])->save();

        $html = $this->get('/menu/' . $item->id)->assertOk()->getContent();
        $this->assertStringContainsString('Crispy and hot', $html);
        $this->assertStringContainsString('Verified order', $html);
        $this->assertStringContainsString('Reply from Bake &amp; Grill', $html);
        $this->assertStringContainsString("/api/reviews/{$review->id}/photos/0?thumb=1", $html);
        $this->assertStringContainsString('"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.0","reviewCount":1}', $html);
    }

    private function review(Item $item, string $comment, ?Customer $by = null): Review
    {
        $by ??= $this->customer;

        return Review::create([
            'customer_id' => $by->id, 'order_id' => Order::factory()->create(['customer_id' => $by->id, 'status' => 'completed'])->id, 'item_id' => $item->id,
            'rating' => 4, 'comment' => $comment, 'type' => 'item', 'status' => 'approved',
        ]);
    }
}
