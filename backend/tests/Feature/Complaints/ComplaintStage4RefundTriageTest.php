<?php

declare(strict_types=1);

namespace Tests\Feature\Complaints;

use App\Domains\Finance\Services\RefundWorkflowService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Complaint;
use App\Models\OrderItem;
use App\Models\Receipt;
use App\Models\Refund;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

class ComplaintStage4RefundTriageTest extends TestCase
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
            'order_number' => 'BG-S4-'.Str::upper(Str::random(4)),
            'total' => 50,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_name' => 'Set meal',
            'quantity' => 1,
            'unit_price' => 50,
            'total_price' => 50,
        ]);

        return Receipt::create([
            'order_id' => $order->id,
            'token' => Str::random(48),
            'channel' => 'sms',
            'recipient' => $customer->phone,
        ]);
    }

    public function test_public_billing_complaint_never_calls_refund_workflow_service(): void
    {
        $receipt = $this->paidReceipt();

        $spy = Mockery::spy(RefundWorkflowService::class);
        $this->app->instance(RefundWorkflowService::class, $spy);

        // Public complaint + service source must never reach the refund workflow.
        $publicSrc = file_get_contents(app_path('Http/Controllers/Api/PublicComplaintController.php'));
        $serviceSrc = file_get_contents(app_path('Domains/Complaints/Services/ComplaintService.php'));
        $this->assertStringNotContainsString('RefundWorkflowService', (string) $publicSrc);
        $this->assertStringNotContainsString('RefundWorkflowService', (string) $serviceSrc);

        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [Complaint::CATEGORY_WRONG_AMOUNT],
            'idempotency_key' => 'billing-1',
        ])->assertCreated();

        $spy->shouldNotHaveReceived('request');
        $spy->shouldNotHaveReceived('approve');
        $spy->shouldNotHaveReceived('reject');
        $spy->shouldNotHaveReceived('refundFullyForCustomerSelfCancel');

        $complaint = Complaint::query()->firstOrFail();
        $this->assertTrue($complaint->needs_refund_review);
        $this->assertNull($complaint->refund_id);
        $this->assertSame(0, Refund::query()->count());
    }

    public function test_manager_can_link_existing_refund_for_audit(): void
    {
        $receipt = $this->paidReceipt();
        $owner = $this->makeOwner(['phone' => '+9607700333']);

        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [Complaint::CATEGORY_WRONG_AMOUNT],
            'idempotency_key' => 'billing-2',
        ])->assertCreated();

        $complaint = Complaint::query()->firstOrFail();
        $refund = Refund::create([
            'order_id' => $receipt->order_id,
            'user_id' => $owner->id,
            'amount' => 10,
            'status' => 'pending',
            'reason' => 'Overcharge on receipt',
            'reason_category' => 'duplicate_charge',
            'requested_at' => now(),
        ]);

        Sanctum::actingAs($owner, ['staff']);
        $this->postJson('/api/complaints/'.$complaint->id.'/link-refund', [
            'refund_id' => $refund->id,
        ])->assertOk()
            ->assertJsonPath('complaint.refund_id', $refund->id)
            ->assertJsonPath('complaint.needs_refund_review', false);

        $complaint->refresh();
        $this->assertSame($refund->id, $complaint->refund_id);
        $this->assertFalse($complaint->needs_refund_review);
    }

    public function test_link_refund_rejects_foreign_order(): void
    {
        $a = $this->paidReceipt();
        $b = $this->paidReceipt();
        $owner = $this->makeOwner(['phone' => '+9607700444']);

        $this->postJson('/api/receipts/'.$a->token.'/complaints', [
            'categories' => [Complaint::CATEGORY_WRONG_AMOUNT],
            'idempotency_key' => 'billing-3',
        ])->assertCreated();
        $complaint = Complaint::query()->firstOrFail();

        $foreignRefund = Refund::create([
            'order_id' => $b->order_id,
            'user_id' => $owner->id,
            'amount' => 5,
            'status' => 'pending',
            'reason' => 'Other order',
            'reason_category' => 'other',
            'requested_at' => now(),
        ]);

        Sanctum::actingAs($owner, ['staff']);
        $this->postJson('/api/complaints/'.$complaint->id.'/link-refund', [
            'refund_id' => $foreignRefund->id,
        ])->assertStatus(422);
    }
}
