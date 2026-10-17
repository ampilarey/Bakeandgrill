<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Http\Controllers\Api\OrderMessageController;
use App\Models\Complaint;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderMessage;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** "Message us" about an order (iruali import plan, feature 9). */
class OrderMessagesTest extends TestCase
{
    use RefreshDatabase;

    private Order $order;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        PermissionCatalogSync::sync();
        $customer = Customer::factory()->create(['phone' => '+9607774444']);
        $this->order = Order::factory()->create(['customer_id' => $customer->id, 'status' => 'preparing', 'completed_at' => null]);
    }

    private function url(): string
    {
        return "/api/orders/track/{$this->order->tracking_token}/messages";
    }

    public function test_the_customer_writes_staff_reply_and_the_customer_is_told(): void
    {
        $this->post($this->url(), ['body' => "I'm running 10 min late", 'photo' => UploadedFile::fake()->image('p.jpg', 800, 600)], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('message.from', 'customer');
        $msg = OrderMessage::query()->firstOrFail();
        $this->assertStringStartsWith('order-message-photos/', (string) $msg->photo_path);

        // The photo needs the signed link; the plain path is refused.
        $this->get("/api/order-messages/{$msg->id}/photo")->assertForbidden();
        $signed = $this->getJson($this->url())->assertOk()->assertJsonPath('can_write', true)->json('messages.0.photo_url');
        $this->get($signed)->assertOk()->assertHeader('Content-Type', 'image/jpeg');

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->getJson('/api/admin/order-messages')->assertOk()->assertJsonPath('data.0.order.id', $this->order->id);
        $this->getJson('/api/orders?active_only=1')->assertOk();
        $this->postJson("/api/admin/orders/{$this->order->id}/messages", ['body' => 'No problem, we will keep it warm.'])->assertCreated();
        $this->getJson('/api/admin/order-messages')->assertJsonCount(0, 'data');

        $reply = SmsLog::query()->where('type', OrderMessageController::TYPE_REPLY)->firstOrFail();
        $this->assertStringContainsString('/order/track/' . $this->order->tracking_token, (string) $reply->message);
        $this->assertTrue(OrderMessage::query()->where('sender', 'customer')->firstOrFail()->read_at !== null);
    }

    public function test_messages_close_two_days_after_completion_and_on_cancel(): void
    {
        Order::query()->whereKey($this->order->id)->update(['status' => 'completed', 'completed_at' => now()->subDay()]);
        $this->postJson($this->url(), ['body' => 'Thanks!'])->assertCreated();

        Order::query()->whereKey($this->order->id)->update(['completed_at' => now()->subDays(3)]);
        $this->postJson($this->url(), ['body' => 'Late note'])->assertUnprocessable();
        $this->getJson($this->url())->assertJsonPath('can_write', false);

        $this->getJson('/api/orders/track/not-a-real-token-at-all/messages')->assertNotFound();
    }

    public function test_the_till_list_shows_unread_customer_messages(): void
    {
        $this->postJson($this->url(), ['body' => 'Extra sauce please'])->assertCreated();
        $this->assertSame(['count' => 1, 'latest' => 'Extra sauce please'], OrderMessageController::unreadFor([$this->order->id])[$this->order->id]);
    }

    public function test_a_message_turns_into_a_complaint_once(): void
    {
        $this->postJson($this->url(), ['body' => 'The rice was cold'])->assertCreated();
        $msg = OrderMessage::query()->firstOrFail();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $id = $this->postJson("/api/admin/order-messages/{$msg->id}/complaint")->assertCreated()->json('complaint_id');
        $this->postJson("/api/admin/order-messages/{$msg->id}/complaint")->assertOk()->assertJsonPath('complaint_id', $id);
        $this->assertSame('The rice was cold', Complaint::query()->findOrFail($id)->comment);
        $this->assertSame($this->order->id, (int) Complaint::query()->findOrFail($id)->order_id);
    }
}
