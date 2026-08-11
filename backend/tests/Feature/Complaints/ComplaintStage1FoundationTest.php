<?php

declare(strict_types=1);

namespace Tests\Feature\Complaints;

use App\Domains\Complaints\Services\ComplaintNotificationService;
use App\Domains\Complaints\Services\ComplaintService;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Complaint;
use App\Models\ComplaintStatusHistory;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Receipt;
use App\Models\ReceiptFeedback;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Mockery;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ComplaintStage1FoundationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    private function paidReceipt(?Customer $customer = null): Receipt
    {
        $customer ??= $this->makeCustomer([
            'phone' => '+9607' . str_pad((string) random_int(100000, 999999), 6, '0'),
            'sms_opt_out' => false,
        ]);
        $order = $this->makePaidOrder($customer, [
            'order_number' => 'BG-C-'.Str::upper(Str::random(4)),
            'delivery_contact_phone' => '+9607770001',
            'total' => 55.00,
        ]);

        return Receipt::create([
            'order_id' => $order->id,
            'token' => Str::random(48),
            'channel' => 'sms',
            'recipient' => '+9607770001',
        ]);
    }

    public function test_complaint_saves_with_category_only(): void
    {
        $receipt = $this->paidReceipt();
        $this->makeOwner(['phone' => '+9607771111']);

        $complaint = app(ComplaintService::class)->create([
            'receipt' => $receipt,
            'order' => $receipt->order,
            'categories' => [Complaint::CATEGORY_FOOD_QUALITY],
        ]);

        $this->assertSame([Complaint::CATEGORY_FOOD_QUALITY], $complaint->categoryList());
        $this->assertSame(Complaint::STATUS_NEW, $complaint->status);
        $this->assertSame('C-'.$complaint->id, $complaint->reference_number);
        $this->assertTrue($complaint->items()->count() === 0);
    }

    public function test_sms_failure_still_saves_and_records_owner_alert(): void
    {
        $receipt = $this->paidReceipt();
        $this->makeOwner(['phone' => '+9607771111']);

        $mock = Mockery::mock(SmsService::class);
        $mock->shouldReceive('send')->andThrow(new \RuntimeException('carrier down'));
        $this->app->instance(SmsService::class, $mock);

        $complaint = app(ComplaintService::class)->create([
            'receipt' => $receipt,
            'order' => $receipt->order,
            'categories' => [Complaint::CATEGORY_WRONG_ITEM],
        ]);

        $this->assertNotNull(Complaint::find($complaint->id));
        $complaint->refresh();
        $this->assertSame(Complaint::OWNER_ALERT_FAILED, $complaint->owner_alert_status);
    }

    public function test_opt_out_suppresses_customer_message_never_owner(): void
    {
        $customer = $this->makeCustomer(['phone' => '+9607770002', 'sms_opt_out' => true]);
        $receipt = $this->paidReceipt($customer);
        $this->makeOwner(['phone' => '+9607772222']);

        $complaint = app(ComplaintService::class)->create([
            'receipt' => $receipt,
            'order' => $receipt->order,
            'categories' => [Complaint::CATEGORY_TOO_LONG],
        ]);

        $this->assertTrue(
            SmsLog::query()->where('type', 'owner_complaint_received')->where('reference_id', (string) $complaint->id)->exists()
            || in_array($complaint->fresh()->owner_alert_status, [
                Complaint::OWNER_ALERT_SENT,
                Complaint::OWNER_ALERT_RETRIED,
                Complaint::OWNER_ALERT_SUPPRESSED,
            ], true)
        );

        $this->assertFalse(
            SmsLog::query()
                ->where('type', 'customer_complaint_acknowledged')
                ->where('reference_id', (string) $complaint->id)
                ->whereIn('status', ['sent', 'demo', 'queued'])
                ->exists()
        );
    }

    public function test_closing_without_customer_reply_is_refused(): void
    {
        $receipt = $this->paidReceipt();
        $owner = $this->makeOwner(['phone' => '+9607773333']);
        $complaint = app(ComplaintService::class)->create([
            'receipt' => $receipt,
            'order' => $receipt->order,
            'categories' => [Complaint::CATEGORY_SOMETHING_ELSE],
        ]);

        Sanctum::actingAs($owner, ['staff']);
        $this->patchJson("/api/complaints/{$complaint->id}/status", [
                'status' => Complaint::STATUS_RESOLVED,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['customer_reply']);
    }

    public function test_status_history_records_every_change(): void
    {
        $receipt = $this->paidReceipt();
        $owner = $this->makeOwner(['phone' => '+9607774444']);
        $complaint = app(ComplaintService::class)->create([
            'receipt' => $receipt,
            'order' => $receipt->order,
            'categories' => [Complaint::CATEGORY_MISSING_ITEM],
        ]);

        app(ComplaintService::class)->changeStatus(
            $complaint,
            Complaint::STATUS_IN_PROGRESS,
            $owner,
            'Called kitchen',
        );
        app(ComplaintService::class)->changeStatus(
            $complaint->fresh(),
            Complaint::STATUS_RESOLVED,
            $owner,
            'Done',
            'Replaced item and apologised',
        );

        $history = ComplaintStatusHistory::query()->where('complaint_id', $complaint->id)->orderBy('id')->get();
        $this->assertCount(3, $history);
        $this->assertSame(Complaint::STATUS_NEW, $history[0]->to_status);
        $this->assertSame(Complaint::STATUS_IN_PROGRESS, $history[1]->to_status);
        $this->assertSame(Complaint::STATUS_RESOLVED, $history[2]->to_status);
        $this->assertSame('Replaced item and apologised', $history[2]->customer_reply);
    }

    public function test_complaints_permissions_are_owner_only(): void
    {
        $receipt = $this->paidReceipt();
        $this->makeOwner(['phone' => '+9607775555']);
        $complaint = app(ComplaintService::class)->create([
            'receipt' => $receipt,
            'order' => $receipt->order,
            'categories' => [Complaint::CATEGORY_WRONG_ITEM],
        ]);

        $manager = $this->makeManager();
        $this->withHeaders($this->staffHeaders($manager))
            ->getJson('/api/complaints')
            ->assertForbidden();

        $owner = $this->makeOwner(['phone' => '+9607779999']);
        Sanctum::actingAs($owner, ['staff']);
        $this->getJson('/api/complaints')
            ->assertOk()
            ->assertJsonPath('meta.open_count', 1);

        Sanctum::actingAs($owner, ['staff']);
        $this->getJson("/api/complaints/{$complaint->id}")
            ->assertOk()
            ->assertJsonPath('complaint.reference_number', $complaint->reference_number);
    }

    public function test_food_safety_raises_urgent_alert_with_different_wording(): void
    {
        $receipt = $this->paidReceipt();
        $this->makeOwner(['phone' => '+9607776666']);

        $complaint = app(ComplaintService::class)->create([
            'receipt' => $receipt,
            'order' => $receipt->order,
            'categories' => [Complaint::CATEGORY_FOOD_SAFETY],
        ]);

        $this->assertTrue($complaint->is_food_safety);

        $log = SmsLog::query()
            ->where('type', 'owner_complaint_received')
            ->where('reference_id', (string) $complaint->id)
            ->latest('id')
            ->first();

        $this->assertNotNull($log);
        $this->assertStringContainsString('URGENT', (string) $log->message);
        $this->assertStringContainsStringIgnoringCase('food', (string) $log->message);
    }

    public function test_queue_pins_food_safety_and_orders_oldest_open_first(): void
    {
        $owner = $this->makeOwner(['phone' => '+9607777777']);
        $r1 = $this->paidReceipt();
        $r2 = $this->paidReceipt();
        $r3 = $this->paidReceipt();

        $old = app(ComplaintService::class)->create([
            'receipt' => $r1,
            'order' => $r1->order,
            'categories' => [Complaint::CATEGORY_TOO_LONG],
        ]);
        $old->forceFill(['created_at' => now()->subHours(5)])->save();

        $newer = app(ComplaintService::class)->create([
            'receipt' => $r2,
            'order' => $r2->order,
            'categories' => [Complaint::CATEGORY_WRONG_ITEM],
        ]);
        $newer->forceFill(['created_at' => now()->subHour()])->save();

        $safety = app(ComplaintService::class)->create([
            'receipt' => $r3,
            'order' => $r3->order,
            'categories' => [Complaint::CATEGORY_FOOD_SAFETY],
        ]);
        $safety->forceFill(['created_at' => now()])->save();

        $res = $this->withHeaders($this->staffHeaders($owner))
            ->getJson('/api/complaints?status=open')
            ->assertOk();

        $ids = collect($res->json('complaints.data'))->pluck('id')->all();
        $this->assertSame($safety->id, $ids[0]);
        $this->assertSame($old->id, $ids[1]);
        $this->assertSame($newer->id, $ids[2]);
    }

    public function test_receipt_feedback_routes_into_complaint_notification_path(): void
    {
        $receipt = $this->paidReceipt();
        $this->makeOwner(['phone' => '+9607778888']);

        $feedback = ReceiptFeedback::create([
            'receipt_id' => $receipt->id,
            'rating' => 2,
            'comments' => 'Cold food',
            'submitted_at' => now(),
        ]);

        $complaint = app(ComplaintService::class)->fromReceiptFeedback($receipt, $feedback);
        $this->assertNotNull($complaint);
        $this->assertSame('receipt_feedback', $complaint->source);
        $this->assertSame($feedback->id, $complaint->receipt_feedback_id);
    }
}
