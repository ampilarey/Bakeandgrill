<?php

declare(strict_types=1);

namespace Tests\Feature\Complaints;

use App\Domains\Finance\Services\RefundWorkflowService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Complaint;
use App\Models\Customer;
use App\Models\OrderItem;
use App\Models\Receipt;
use App\Models\Refund;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A rehearsal, not a unit test: one unhappy customer, start to finish.
 *
 * The stage tests each guard their own piece — the form, the photo, the SMS,
 * the refund link. What none of them walks is the whole thing in order, and
 * the seams between the pieces are where a complaint quietly stops moving:
 * a reply collected and never sent, a refund linked and then rejected, a
 * closed complaint reopened that still claims to be resolved.
 *
 * So this reads as the story does. A customer complains about the food, a
 * manager works it, money moves, the customer hears back — and the awkward
 * variants get their own run-through afterwards.
 */
class ComplaintRehearsalTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->owner = $this->makeOwner(['phone' => '+9607700900', 'name' => 'Owner']);
        $this->customer = $this->makeCustomer(['phone' => '+9607705500', 'sms_opt_out' => false]);
    }

    /** A real sale: two lines, paid, receipt sent to the customer's phone. */
    private function paidReceipt(): Receipt
    {
        $order = $this->makePaidOrder($this->customer, [
            'order_number' => 'BG-R-' . Str::upper(Str::random(4)),
            'total' => 120.00,
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'item_name' => 'Chicken shawarma',
            'quantity' => 2, 'unit_price' => 45, 'total_price' => 90,
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'item_name' => 'Cold coffee',
            'quantity' => 1, 'unit_price' => 30, 'total_price' => 30,
        ]);

        return Receipt::create([
            'order_id' => $order->id,
            'token' => Str::random(48),
            'channel' => 'sms',
            'recipient' => (string) $this->customer->phone,
        ]);
    }

    private function smsSent(string $type, Complaint $complaint): bool
    {
        return SmsLog::query()
            ->where('type', $type)
            ->where('reference_type', 'complaint')
            ->where('reference_id', (string) $complaint->id)
            ->exists();
    }

    private function smsBody(string $type, Complaint $complaint): string
    {
        return (string) SmsLog::query()
            ->where('type', $type)
            ->where('reference_type', 'complaint')
            ->where('reference_id', (string) $complaint->id)
            ->value('message');
    }

    public function test_the_whole_thing_start_to_finish(): void
    {
        $receipt = $this->paidReceipt();
        $shawarma = OrderItem::query()->where('item_name', 'Chicken shawarma')->firstOrFail();

        // ── The customer, on their phone, on the receipt link ────────────────
        $submitted = $this->postJson('/api/receipts/' . $receipt->token . '/complaints', [
            'categories' => [Complaint::CATEGORY_FOOD_QUALITY],
            'comment' => 'The shawarma was cold and the bread was stale.',
            'order_item_ids' => [$shawarma->id],
            'idempotency_key' => 'rehearsal-1',
        ])->assertCreated();

        $complaint = Complaint::query()->firstOrFail();
        // They are told what happens next, in their own terms, with a reference
        // they can quote.
        $submitted->assertJsonPath('complaint.reference_number', $complaint->reference_number);
        $this->assertTrue($submitted->json('will_call'));
        $this->assertStringContainsString('call you on', (string) $submitted->json('confirmation'));

        // The line they complained about is captured as it was sold, not as a
        // pointer to a menu item that may be edited tomorrow.
        $this->assertSame(1, $complaint->items()->count());
        $this->assertSame('Chicken shawarma', $complaint->items()->first()->item_name);
        $this->assertSame(9000, (int) $complaint->items()->first()->line_total_laar);

        // Both messages go out: the owner is told, the customer is acknowledged.
        $this->assertSame(Complaint::OWNER_ALERT_SENT, $complaint->owner_alert_status);
        $this->assertTrue($this->smsSent('customer_complaint_acknowledged', $complaint));

        // ── The queue, the next morning ──────────────────────────────────────
        Sanctum::actingAs($this->owner, ['staff']);
        $queue = $this->getJson('/api/complaints')->assertOk();
        $queue->assertJsonPath('meta.open_count', 1);
        $queue->assertJsonPath('meta.oldest_open_reference', $complaint->reference_number);
        $this->assertSame($complaint->id, $queue->json('complaints.data.0.id'));

        $detail = $this->getJson('/api/complaints/' . $complaint->id)->assertOk();
        $detail->assertJsonPath('complaint.comment', 'The shawarma was cold and the bread was stale.');
        // The photo path is never handed out, even to staff — they fetch it
        // through its own route.
        $this->assertArrayNotHasKey('photo_path', $detail->json('complaint'));

        // ── A manager rings the customer ─────────────────────────────────────
        $this->postJson('/api/complaints/' . $complaint->id . '/contact-logs', [
            'channel' => 'phone',
            'note' => 'Called, apologised. Offered a refund on the shawarma.',
        ])->assertCreated();

        $this->patchJson('/api/complaints/' . $complaint->id . '/status', [
            'status' => Complaint::STATUS_IN_PROGRESS,
            'internal_note' => 'Kitchen told. Refunding the shawarma line.',
        ])->assertOk();

        // ── The money ────────────────────────────────────────────────────────
        $refund = Refund::create([
            'order_id' => $receipt->order_id,
            'user_id' => $this->owner->id,
            'amount' => 90,
            'status' => 'approved',
            'reason' => 'Cold food, complaint ' . $complaint->reference_number,
            'reason_category' => 'quality',
            'requested_at' => now(),
        ]);

        $this->postJson('/api/complaints/' . $complaint->id . '/link-refund', [
            'refund_id' => $refund->id,
        ])->assertOk()->assertJsonPath('complaint.needs_refund_review', false);

        // ── Closing it ───────────────────────────────────────────────────────
        $this->patchJson('/api/complaints/' . $complaint->id . '/status', [
            'status' => Complaint::STATUS_RESOLVED,
            'internal_note' => 'Refund approved and paid.',
            'customer_reply' => 'Sorry about the cold shawarma — we have refunded it in full.',
        ])->assertOk();

        $complaint->refresh();
        $this->assertSame(Complaint::STATUS_RESOLVED, $complaint->status);
        $this->assertNotNull($complaint->resolved_at);
        $this->assertSame($this->owner->id, (int) $complaint->resolved_by);

        // The customer hears the actual reply, not a form letter.
        $this->assertStringContainsString(
            'we have refunded it in full',
            $this->smsBody('customer_complaint_resolved', $complaint),
        );

        // Every step is on the record, in order.
        $this->assertSame(
            [null, Complaint::STATUS_NEW, Complaint::STATUS_IN_PROGRESS, Complaint::STATUS_IN_PROGRESS],
            $complaint->statusHistories()->orderBy('id')->pluck('from_status')->all(),
        );
        $this->assertSame(1, $complaint->contactLogs()->count());

        // ── Back on the receipt link ─────────────────────────────────────────
        $html = $this->get('/receipts/' . $receipt->token)->assertOk()->getContent();
        $this->assertStringContainsString($complaint->reference_number, $html);
        $this->assertStringContainsString('we have refunded it in full', $html);
        // What was said internally stays internal.
        $this->assertStringNotContainsString('Kitchen told', $html);
        $this->assertStringNotContainsString('Refund approved and paid', $html);

        // The queue is empty again.
        $this->getJson('/api/complaints')->assertOk()->assertJsonPath('meta.open_count', 0);
    }

    public function test_a_complaint_we_are_not_acting_on_still_reaches_the_customer(): void
    {
        /*
         * Closing as "not actionable" demands a customer reply exactly as
         * resolving does — the form refuses without one. Collecting that
         * sentence and then never sending it would be the worst of both: the
         * manager believes they have answered, and the customer hears nothing
         * at all about the complaint they were promised a call on.
         */
        $receipt = $this->paidReceipt();
        $this->postJson('/api/receipts/' . $receipt->token . '/complaints', [
            'categories' => [Complaint::CATEGORY_SOMETHING_ELSE],
            'comment' => 'The music was too loud.',
            'idempotency_key' => 'rehearsal-na',
        ])->assertCreated();
        $complaint = Complaint::query()->firstOrFail();

        Sanctum::actingAs($this->owner, ['staff']);
        $this->patchJson('/api/complaints/' . $complaint->id . '/status', [
            'status' => Complaint::STATUS_NOT_ACTIONABLE,
            'internal_note' => 'Nothing to do — the volume is set by the mall.',
            'customer_reply' => 'Thanks for telling us. The music is set by the mall, so we cannot change it.',
        ])->assertOk();

        $this->assertStringContainsString(
            'set by the mall',
            $this->smsBody('customer_complaint_resolved', $complaint),
        );
        // The internal reason for closing it is not what the customer reads.
        $this->assertStringNotContainsString(
            'Nothing to do',
            $this->smsBody('customer_complaint_resolved', $complaint),
        );
    }

    public function test_a_rejected_refund_puts_the_complaint_back_on_the_list(): void
    {
        /*
         * Linking a pending refund clears the refund-review flag: somebody has
         * looked, and money is on its way. If that refund is then rejected,
         * nothing is on its way — and without this, the complaint sits closed
         * over a customer who was told they would be paid.
         */
        $receipt = $this->paidReceipt();
        $this->postJson('/api/receipts/' . $receipt->token . '/complaints', [
            'categories' => [Complaint::CATEGORY_WRONG_AMOUNT],
            'comment' => 'Charged twice for the coffee.',
            'idempotency_key' => 'rehearsal-reject',
        ])->assertCreated();
        $complaint = Complaint::query()->firstOrFail();
        $this->assertTrue($complaint->needs_refund_review);

        $cashier = $this->makeStaff('cashier', ['phone' => '+9607700901']);
        $refund = Refund::create([
            'order_id' => $receipt->order_id,
            'user_id' => $cashier->id,
            'amount' => 30,
            'status' => 'pending',
            'reason' => 'Double charge',
            'reason_category' => 'duplicate_charge',
            'requested_at' => now(),
        ]);

        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson('/api/complaints/' . $complaint->id . '/link-refund', [
            'refund_id' => $refund->id,
        ])->assertOk();
        $this->assertFalse($complaint->fresh()->needs_refund_review);

        app(RefundWorkflowService::class)->reject($refund, $this->owner, 'Only one charge on the statement.');

        $complaint->refresh();
        $this->assertTrue(
            $complaint->needs_refund_review,
            'A rejected refund must put the complaint back in front of a manager.',
        );
        $this->assertStringContainsString(
            'rejected',
            // The relation is pinned oldest-first, so take the tail rather than
            // appending an ordering that never wins.
            (string) $complaint->statusHistories()->get()->last()?->internal_note,
        );
    }

    public function test_reopening_a_closed_complaint_stops_claiming_it_is_resolved(): void
    {
        // The customer rings back: it was not fixed. Reopening has to undo the
        // closure, not leave a complaint that is open and resolved at once.
        $receipt = $this->paidReceipt();
        $this->postJson('/api/receipts/' . $receipt->token . '/complaints', [
            'categories' => [Complaint::CATEGORY_FOOD_QUALITY],
            'idempotency_key' => 'rehearsal-reopen',
        ])->assertCreated();
        $complaint = Complaint::query()->firstOrFail();

        Sanctum::actingAs($this->owner, ['staff']);
        $this->patchJson('/api/complaints/' . $complaint->id . '/status', [
            'status' => Complaint::STATUS_RESOLVED,
            'customer_reply' => 'We have spoken to the kitchen.',
        ])->assertOk();
        $this->assertNotNull($complaint->fresh()->resolved_at);

        $this->patchJson('/api/complaints/' . $complaint->id . '/status', [
            'status' => Complaint::STATUS_IN_PROGRESS,
            'internal_note' => 'Customer called back — not fixed.',
        ])->assertOk();

        $complaint->refresh();
        $this->assertSame(Complaint::STATUS_IN_PROGRESS, $complaint->status);
        $this->assertNull($complaint->resolved_at, 'A reopened complaint is not resolved.');
        $this->assertNull($complaint->resolved_by);
        // It is back in the queue, where somebody will see it.
        $this->getJson('/api/complaints')->assertOk()->assertJsonPath('meta.open_count', 1);
    }

    public function test_a_cashier_can_see_the_queue_but_not_change_it(): void
    {
        // Complaints are owner-work by default. A cashier finding the endpoint
        // must not be able to close their own complaint.
        $receipt = $this->paidReceipt();
        $this->postJson('/api/receipts/' . $receipt->token . '/complaints', [
            'categories' => [Complaint::CATEGORY_FOOD_QUALITY],
            'idempotency_key' => 'rehearsal-perm',
        ])->assertCreated();
        $complaint = Complaint::query()->firstOrFail();

        $cashier = $this->makeStaff('cashier', ['phone' => '+9607700902']);
        Sanctum::actingAs($cashier, ['staff']);

        $this->getJson('/api/complaints')->assertForbidden();
        $this->patchJson('/api/complaints/' . $complaint->id . '/status', [
            'status' => Complaint::STATUS_RESOLVED,
            'customer_reply' => 'Sorted.',
        ])->assertForbidden();

        $this->assertSame(Complaint::STATUS_NEW, $complaint->fresh()->status);
    }
}
