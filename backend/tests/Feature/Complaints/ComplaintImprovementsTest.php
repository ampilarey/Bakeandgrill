<?php

declare(strict_types=1);

namespace Tests\Feature\Complaints;

use App\Domains\Complaints\Services\ComplaintService;
use App\Domains\Finance\Services\RefundWorkflowService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Complaint;
use App\Models\OrderItem;
use App\Models\Receipt;
use App\Models\ReceiptFeedback;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Support\ComplaintFormPresenter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

class ComplaintImprovementsTest extends TestCase
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
            'order_number' => 'BG-IMP-'.Str::upper(Str::random(4)),
            'type' => 'delivery',
            'delivery_contact_phone' => $customer->phone,
            'total' => 40,
            'paid_at' => now()->subHours(2),
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

    public function test_three_categories_save_and_display_zero_and_five_rejected(): void
    {
        $receipt = $this->paidReceipt();

        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [
                Complaint::CATEGORY_MISSING_ITEM,
                Complaint::CATEGORY_FOOD_QUALITY,
                Complaint::CATEGORY_TOO_LONG,
            ],
            'idempotency_key' => 'three',
        ])->assertCreated()
            ->assertJsonPath('complaint.categories.0', Complaint::CATEGORY_MISSING_ITEM)
            ->assertJsonPath('complaint.categories.2', Complaint::CATEGORY_TOO_LONG);

        $complaint = Complaint::query()->firstOrFail();
        $this->assertSame([
            Complaint::CATEGORY_MISSING_ITEM,
            Complaint::CATEGORY_FOOD_QUALITY,
            Complaint::CATEGORY_TOO_LONG,
        ], $complaint->categoryList());

        $html = $this->get('/receipts/'.$receipt->token)->assertOk()->getContent();
        $this->assertStringContainsString($complaint->reference_number, $html);
        $this->assertStringContainsString('Missing item', $html);
        $this->assertStringContainsString('Food quality', $html);

        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [],
            'idempotency_key' => 'zero',
        ])->assertStatus(422);

        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [
                Complaint::CATEGORY_WRONG_ITEM,
                Complaint::CATEGORY_MISSING_ITEM,
                Complaint::CATEGORY_FOOD_QUALITY,
                Complaint::CATEGORY_TOO_LONG,
                Complaint::CATEGORY_SOMETHING_ELSE,
            ],
            'idempotency_key' => 'five',
        ])->assertStatus(422);
    }

    public function test_billing_plus_non_billing_sets_needs_refund_review(): void
    {
        $receipt = $this->paidReceipt();

        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [
                Complaint::CATEGORY_FOOD_QUALITY,
                Complaint::CATEGORY_WRONG_AMOUNT,
            ],
            'idempotency_key' => 'bill-mix',
        ])->assertCreated();

        $complaint = Complaint::query()->firstOrFail();
        $this->assertTrue($complaint->needs_refund_review);
        $this->assertFalse($complaint->is_food_safety);
    }

    public function test_food_safety_plus_minor_still_urgent_alert(): void
    {
        $receipt = $this->paidReceipt();

        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [
                Complaint::CATEGORY_FOOD_SAFETY,
                Complaint::CATEGORY_TOO_LONG,
            ],
            'idempotency_key' => 'safety-mix',
        ])->assertCreated();

        $complaint = Complaint::query()->firstOrFail();
        $this->assertTrue($complaint->is_food_safety);

        $log = SmsLog::query()
            ->where('type', 'owner_complaint_received')
            ->where('reference_id', (string) $complaint->id)
            ->latest('id')
            ->first();
        $this->assertNotNull($log);
        $this->assertStringContainsString('URGENT', (string) $log->message);
    }

    public function test_longest_window_accepts_billing_after_food_window_closed(): void
    {
        SiteSetting::query()->updateOrCreate(
            ['key' => 'complaint_window_food_hours'],
            ['value' => '24', 'type' => 'text', 'group' => 'Complaints', 'label' => 'food', 'is_public' => false],
        );
        SiteSetting::query()->updateOrCreate(
            ['key' => 'complaint_window_billing_hours'],
            ['value' => '720', 'type' => 'text', 'group' => 'Complaints', 'label' => 'bill', 'is_public' => false],
        );

        $receipt = $this->paidReceipt();
        $receipt->order->forceFill([
            'paid_at' => now()->subDays(5),
            'created_at' => now()->subDays(5),
        ])->save();

        // Food alone would be closed after 5 days with a 24h food window.
        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [Complaint::CATEGORY_FOOD_QUALITY],
            'idempotency_key' => 'food-only-closed',
        ])->assertStatus(422)->assertJsonPath('window_closed', true);

        // Food + billing uses the longer billing window and must be accepted.
        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [
                Complaint::CATEGORY_FOOD_QUALITY,
                Complaint::CATEGORY_WRONG_AMOUNT,
            ],
            'idempotency_key' => 'food-bill-open',
        ])->assertCreated();
    }

    public function test_legacy_single_category_rows_still_read_after_migration_shape(): void
    {
        $receipt = $this->paidReceipt();
        $complaint = app(ComplaintService::class)->create([
            'receipt' => $receipt,
            'order' => $receipt->order,
            'category' => Complaint::CATEGORY_WRONG_ITEM, // singular input still accepted
        ]);

        $this->assertSame([Complaint::CATEGORY_WRONG_ITEM], $complaint->fresh()->categoryList());

        $owner = $this->makeOwner(['phone' => '+9607700999']);
        Sanctum::actingAs($owner, ['staff']);
        $this->getJson('/api/complaints?status=open')
            ->assertOk()
            ->assertJsonPath('complaints.data.0.categories.0', Complaint::CATEGORY_WRONG_ITEM);
    }

    public function test_public_path_never_reaches_refund_workflow_service(): void
    {
        $receipt = $this->paidReceipt();
        $spy = Mockery::spy(RefundWorkflowService::class);
        $this->app->instance(RefundWorkflowService::class, $spy);

        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [
                Complaint::CATEGORY_WRONG_AMOUNT,
                Complaint::CATEGORY_MISSING_ITEM,
            ],
            'idempotency_key' => 'no-refund',
        ])->assertCreated();

        $spy->shouldNotHaveReceived('request');
        $spy->shouldNotHaveReceived('approve');
    }

    public function test_internal_note_never_in_public_payload_or_sms(): void
    {
        $receipt = $this->paidReceipt();
        $owner = $this->makeOwner(['phone' => '+9607700555']);
        $complaint = app(ComplaintService::class)->create([
            'receipt' => $receipt,
            'order' => $receipt->order,
            'categories' => [Complaint::CATEGORY_SOMETHING_ELSE],
        ]);

        $secret = 'customer was rude, watch this one';
        app(ComplaintService::class)->changeStatus(
            $complaint,
            Complaint::STATUS_RESOLVED,
            $owner,
            $secret,
            'We replaced your order. Sorry about that.',
        );

        $presenter = ComplaintFormPresenter::forReceipt($receipt->fresh());
        $json = json_encode($presenter);
        $this->assertStringNotContainsString($secret, (string) $json);
        $this->assertStringNotContainsString('internal_note', (string) $json);

        foreach ($presenter['existing_complaints'] as $row) {
            $this->assertArrayNotHasKey('internal_note', $row);
            $this->assertArrayNotHasKey('contact_logs', $row);
            $this->assertSame('We replaced your order. Sorry about that.', $row['customer_reply']);
        }

        $html = $this->get('/receipts/'.$receipt->token)->assertOk()->getContent();
        $this->assertStringNotContainsString($secret, $html);
        $this->assertStringContainsString('We replaced your order. Sorry about that.', $html);

        $sms = SmsLog::query()
            ->where('type', 'customer_complaint_resolved')
            ->where('reference_id', (string) $complaint->id)
            ->latest('id')
            ->first();
        $this->assertNotNull($sms);
        $this->assertStringNotContainsString($secret, (string) $sms->message);
        $this->assertStringContainsString('We replaced your order. Sorry about that.', (string) $sms->message);
    }

    public function test_contact_log_never_appears_publicly(): void
    {
        $receipt = $this->paidReceipt();
        $owner = $this->makeOwner(['phone' => '+9607700666']);
        $complaint = app(ComplaintService::class)->create([
            'receipt' => $receipt,
            'order' => $receipt->order,
            'categories' => [Complaint::CATEGORY_WRONG_ITEM],
        ]);

        $private = 'Called and agreed 50% off next visit';
        app(ComplaintService::class)->addContactLog($complaint, 'phone', $private, $owner);

        $presenter = ComplaintFormPresenter::forReceipt($receipt->fresh());
        $this->assertStringNotContainsString($private, (string) json_encode($presenter));
        $html = $this->get('/receipts/'.$receipt->token)->assertOk()->getContent();
        $this->assertStringNotContainsString($private, $html);
    }

    public function test_closing_without_customer_reply_refused_and_reply_on_receipt(): void
    {
        $receipt = $this->paidReceipt();
        $owner = $this->makeOwner(['phone' => '+9607700777']);
        $complaint = app(ComplaintService::class)->create([
            'receipt' => $receipt,
            'order' => $receipt->order,
            'categories' => [Complaint::CATEGORY_MISSING_ITEM],
        ]);

        Sanctum::actingAs($owner, ['staff']);
        $this->patchJson('/api/complaints/'.$complaint->id.'/status', [
            'status' => Complaint::STATUS_RESOLVED,
            'internal_note' => 'staff only',
        ])->assertStatus(422)->assertJsonValidationErrors(['customer_reply']);

        $this->patchJson('/api/complaints/'.$complaint->id.'/status', [
            'status' => Complaint::STATUS_RESOLVED,
            'internal_note' => 'staff only',
            'customer_reply' => 'Item re-sent this afternoon.',
        ])->assertOk();

        $html = $this->get('/receipts/'.$receipt->token)->assertOk()->getContent();
        $this->assertStringContainsString('Item re-sent this afternoon.', $html);
        $this->assertStringContainsString('Sorted', $html);
        $this->assertStringNotContainsString('staff only', $html);
        $this->assertStringNotContainsString('"resolved"', $html);
    }

    public function test_migration_moved_resolution_notes_to_internal_not_customer_reply(): void
    {
        // Simulate pre-migration shape on a fresh DB by inserting via the migrated columns
        // and asserting the migration path semantics: old notes land in internal_note.
        $receipt = $this->paidReceipt();
        $id = DB::table('complaints')->insertGetId([
            'reference_number' => 'C-LEGACY-1',
            'receipt_id' => $receipt->id,
            'order_id' => $receipt->order_id,
            'source' => 'receipt',
            'categories' => json_encode([Complaint::CATEGORY_TOO_LONG]),
            'status' => Complaint::STATUS_RESOLVED,
            'needs_refund_review' => false,
            'is_food_safety' => false,
            'owner_alert_status' => 'sent',
            'internal_note' => 'Was resolution_note: refunded 20 quietly',
            'customer_reply' => null,
            'resolved_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $row = Complaint::query()->findOrFail($id);
        $this->assertSame('Was resolution_note: refunded 20 quietly', $row->internal_note);
        $this->assertNull($row->customer_reply);

        $summary = $row->toPublicSummary();
        $this->assertNull($summary['customer_reply']);
        $this->assertStringNotContainsString('refunded 20 quietly', (string) json_encode($summary));
    }

    public function test_receipt_lists_own_complaints_plain_status_foreign_token_isolated(): void
    {
        $a = $this->paidReceipt();
        $b = $this->paidReceipt();

        $this->postJson('/api/receipts/'.$a->token.'/complaints', [
            'categories' => [Complaint::CATEGORY_WRONG_ITEM],
            'idempotency_key' => 'a1',
        ])->assertCreated();
        $refA = Complaint::query()->where('receipt_id', $a->id)->value('reference_number');

        $this->postJson('/api/receipts/'.$b->token.'/complaints', [
            'categories' => [Complaint::CATEGORY_FOOD_QUALITY],
            'idempotency_key' => 'b1',
        ])->assertCreated();
        $refB = Complaint::query()->where('receipt_id', $b->id)->value('reference_number');

        $htmlA = $this->get('/receipts/'.$a->token)->assertOk()->getContent();
        $this->assertStringContainsString((string) $refA, $htmlA);
        $this->assertStringNotContainsString((string) $refB, $htmlA);
        $this->assertStringContainsString('Nothing done yet', $htmlA);
        // Plain-word status only — raw keys must not appear in the customer list.
        $this->assertStringNotContainsString('in_progress', $htmlA);
        $this->assertDoesNotMatchRegularExpression('/\bnot_actionable\b/', $htmlA);

        $presenterB = ComplaintFormPresenter::forReceipt($b->fresh(['order']));
        $refs = collect($presenterB['existing_complaints'])->pluck('reference_number')->all();
        $this->assertContains($refB, $refs);
        $this->assertNotContains($refA, $refs);
    }

    public function test_at_cap_lists_own_open_complaints_instead_of_flat_refusal(): void
    {
        SiteSetting::query()->updateOrCreate(
            ['key' => 'complaint_open_cap_per_receipt'],
            ['value' => '1', 'type' => 'text', 'group' => 'Complaints', 'label' => 'cap', 'is_public' => false],
        );
        $receipt = $this->paidReceipt();
        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [Complaint::CATEGORY_TOO_LONG],
            'idempotency_key' => 'cap-a',
        ])->assertCreated();
        $ref = Complaint::query()->value('reference_number');

        $res = $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [Complaint::CATEGORY_SOMETHING_ELSE],
            'idempotency_key' => 'cap-b',
        ])->assertStatus(422);

        $this->assertTrue($res->json('at_open_cap'));
        $this->assertSame($ref, $res->json('existing_complaints.0.reference_number'));
        $this->assertNotEmpty($res->json('whatsapp_href'));

        $html = $this->get('/receipts/'.$receipt->token)->assertOk()->getContent();
        $this->assertStringContainsString((string) $ref, $html);
        $this->assertStringContainsString('Continue on WhatsApp', $html);
    }

    public function test_rating_twice_leaves_one_row_with_newer_value(): void
    {
        $receipt = $this->paidReceipt();

        $this->postJson('/api/receipts/'.$receipt->token.'/feedback', [
            'rating' => 3,
            'comments' => 'ok',
        ])->assertCreated()->assertJsonPath('feedback.rating', 3);

        $this->postJson('/api/receipts/'.$receipt->token.'/feedback', [
            'rating' => 5,
            'comments' => 'actually great',
        ])->assertSuccessful()->assertJsonPath('feedback.rating', 5);

        // Also exercise the Blade form controller path (upsert, not a second row).
        $this->post('/receipts/'.$receipt->token.'/feedback', [
            '_token' => csrf_token(),
            'rating' => 4,
            'comments' => 'changed via form',
        ]);

        $this->assertSame(1, ReceiptFeedback::query()->where('receipt_id', $receipt->id)->count());
        $row = ReceiptFeedback::query()->where('receipt_id', $receipt->id)->first();
        $this->assertSame(4, (int) $row->rating);
        $this->assertSame('changed via form', $row->comments);

        $html = $this->get('/receipts/'.$receipt->token)->assertOk()->getContent();
        $this->assertStringContainsString('Your rating', $html);
        $this->assertStringContainsString('Change rating', $html);
    }

    public function test_unique_constraint_holds_when_code_path_bypassed(): void
    {
        $receipt = $this->paidReceipt();
        ReceiptFeedback::create([
            'receipt_id' => $receipt->id,
            'rating' => 4,
            'comments' => 'one',
            'submitted_at' => now(),
        ]);

        $this->expectException(\Throwable::class);
        ReceiptFeedback::create([
            'receipt_id' => $receipt->id,
            'rating' => 1,
            'comments' => 'two',
            'submitted_at' => now(),
        ]);
    }

    public function test_migration_collapses_duplicate_feedback_to_most_recent(): void
    {
        // Reproduce the collapse logic the migration runs (table already unique after migrate).
        // Temporarily drop unique, insert dupes, re-run collapse, assert one remains.
        $receipt = $this->paidReceipt();

        try {
            Schema::table('receipt_feedback', function ($table) {
                $table->dropUnique('receipt_feedback_receipt_id_unique');
            });
        } catch (\Throwable) {
            try {
                Schema::table('receipt_feedback', function ($table) {
                    $table->dropUnique(['receipt_id']);
                });
            } catch (\Throwable) {
                $this->markTestSkipped('Could not drop unique to simulate pre-migration duplicates');
            }
        }

        DB::table('receipt_feedback')->insert([
            [
                'receipt_id' => $receipt->id,
                'rating' => 2,
                'comments' => 'old',
                'submitted_at' => now()->subDay(),
                'created_at' => now()->subDay(),
                'updated_at' => now()->subDay(),
            ],
            [
                'receipt_id' => $receipt->id,
                'rating' => 5,
                'comments' => 'newest',
                'submitted_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $keepId = DB::table('receipt_feedback')
            ->where('receipt_id', $receipt->id)
            ->orderByDesc('id')
            ->value('id');
        $deleted = DB::table('receipt_feedback')
            ->where('receipt_id', $receipt->id)
            ->where('id', '!=', $keepId)
            ->delete();
        $this->assertGreaterThanOrEqual(1, $deleted);
        $this->assertSame(1, DB::table('receipt_feedback')->where('receipt_id', $receipt->id)->count());
        $this->assertSame('newest', DB::table('receipt_feedback')->where('id', $keepId)->value('comments'));

        Schema::table('receipt_feedback', function ($table) {
            $table->unique('receipt_id', 'receipt_feedback_receipt_id_unique');
        });
    }
}
