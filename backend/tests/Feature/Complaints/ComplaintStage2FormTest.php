<?php

declare(strict_types=1);

namespace Tests\Feature\Complaints;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Complaint;
use App\Models\OrderItem;
use App\Models\Receipt;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class ComplaintStage2FormTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->makeOwner(['phone' => '+9607700100']);
    }

    private function paidReceipt(): Receipt
    {
        $customer = $this->makeCustomer([
            'phone' => '+9607'.str_pad((string) random_int(100000, 999999), 6, '0'),
            'sms_opt_out' => false,
        ]);
        $order = $this->makePaidOrder($customer, [
            'order_number' => 'BG-S2-'.Str::upper(Str::random(4)),
            'type' => 'delivery',
            'delivery_contact_phone' => $customer->phone,
            'total' => 40,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_name' => 'Momo set',
            'quantity' => 2,
            'unit_price' => 20,
            'total_price' => 40,
        ]);

        return Receipt::create([
            'order_id' => $order->id,
            'token' => Str::random(48),
            'channel' => 'sms',
            'recipient' => $customer->phone,
        ]);
    }

    public function test_category_only_submits(): void
    {
        $receipt = $this->paidReceipt();
        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [Complaint::CATEGORY_FOOD_QUALITY],
            'idempotency_key' => 'k1',
        ])->assertCreated()
            ->assertJsonPath('complaint.categories.0', Complaint::CATEGORY_FOOD_QUALITY);

        $this->assertSame(1, Complaint::query()->count());
    }

    public function test_receipt_page_has_send_not_auto_submit_on_category(): void
    {
        $receipt = $this->paidReceipt();
        $html = $this->get('/receipts/'.$receipt->token)->assertOk()->getContent();
        $this->assertStringContainsString('data-complaint-send', $html);
        $this->assertStringContainsString('data-complaint-cat', $html);
        $this->assertStringContainsString('Something wrong with this receipt?', $html);
        $this->assertStringContainsString('name="csrf-token"', $html);
        // Category buttons are type=button; Send starts disabled until a category is chosen.
        $this->assertMatchesRegularExpression('/data-complaint-send[^>]*disabled/', $html);
    }

    public function test_public_complaint_submit_does_not_require_csrf_token(): void
    {
        $receipt = $this->paidReceipt();

        // Simulate a browser same-origin fetch from the receipt page with no CSRF header.
        // Sanctum statefulApi() would 419 this without the bootstrap except list.
        $this->withHeader('Origin', config('app.url'))
            ->withHeader('Referer', rtrim((string) config('app.url'), '/').'/receipts/'.$receipt->token)
            ->postJson('/api/receipts/'.$receipt->token.'/complaints', [
                'categories' => [Complaint::CATEGORY_SOMETHING_ELSE],
                'idempotency_key' => 'no-csrf',
            ])
            ->assertCreated()
            ->assertJsonPath('complaint.categories.0', Complaint::CATEGORY_SOMETHING_ELSE);
    }

    public function test_double_submit_idempotency_creates_one_complaint(): void
    {
        $receipt = $this->paidReceipt();
        $payload = [
            'categories' => [Complaint::CATEGORY_WRONG_ITEM],
            'idempotency_key' => 'same-key',
        ];
        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', $payload)->assertCreated();
        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', $payload)->assertCreated();
        $this->assertSame(1, Complaint::query()->count());
    }

    public function test_invalid_and_foreign_tokens_refused(): void
    {
        $a = $this->paidReceipt();
        $b = $this->paidReceipt();

        $this->postJson('/api/receipts/not-a-real-token/complaints', [
            'categories' => [Complaint::CATEGORY_SOMETHING_ELSE],
        ])->assertNotFound();

        // Cannot attach items from another order via this token.
        $foreignItem = OrderItem::query()->where('order_id', $b->order_id)->first();
        $this->postJson('/api/receipts/'.$a->token.'/complaints', [
            'categories' => [Complaint::CATEGORY_MISSING_ITEM],
            'order_item_ids' => [$foreignItem->id],
            'idempotency_key' => 'foreign',
        ])->assertCreated();

        $complaint = Complaint::query()->latest('id')->first();
        $this->assertSame(0, $complaint->items()->count());
    }

    public function test_item_snapshots_survive_later_order_edit(): void
    {
        $receipt = $this->paidReceipt();
        $item = OrderItem::query()->where('order_id', $receipt->order_id)->first();

        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [Complaint::CATEGORY_WRONG_ITEM],
            'order_item_ids' => [$item->id],
            'idempotency_key' => 'snap',
        ])->assertCreated();

        $item->update(['item_name' => 'Renamed later', 'unit_price' => 99, 'total_price' => 99]);

        $snap = Complaint::query()->latest('id')->first()->items()->first();
        $this->assertSame('Momo set', $snap->item_name);
        $this->assertSame(2000, (int) $snap->unit_price_laar);
    }

    public function test_closed_window_is_explained(): void
    {
        SiteSetting::query()->updateOrCreate(
            ['key' => 'complaint_window_food_hours'],
            ['value' => '1', 'type' => 'text', 'group' => 'Complaints', 'label' => 'food hours', 'is_public' => false],
        );

        $receipt = $this->paidReceipt();
        $receipt->order->forceFill([
            'paid_at' => now()->subDays(3),
            'created_at' => now()->subDays(3),
        ])->save();

        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [Complaint::CATEGORY_FOOD_QUALITY],
        ])->assertStatus(422)
            ->assertJsonPath('window_closed', true);
    }

    public function test_open_cap_per_receipt(): void
    {
        SiteSetting::query()->updateOrCreate(
            ['key' => 'complaint_open_cap_per_receipt'],
            ['value' => '1', 'type' => 'text', 'group' => 'Complaints', 'label' => 'cap', 'is_public' => false],
        );
        $receipt = $this->paidReceipt();
        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [Complaint::CATEGORY_TOO_LONG],
            'idempotency_key' => 'a',
        ])->assertCreated();
        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [Complaint::CATEGORY_SOMETHING_ELSE],
            'idempotency_key' => 'b',
        ])->assertStatus(422);
    }
}
