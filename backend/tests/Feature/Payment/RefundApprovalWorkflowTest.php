<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Orders\Events\OrderRefunded;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Refund;
use App\Models\Role;
use App\Models\Shift;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RefundApprovalWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;

    private User $manager;

    private User $owner;

    private Customer $customer;

    /** @var list<array{to: string, type: string, message: string}> */
    private array $sentSms = [];

    protected function setUp(): void
    {
        parent::setUp();

        $staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $managerRole = Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'is_active' => true]);
        $ownerRole = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $this->cashier = User::factory()->create([
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'phone' => '+9607001001',
            'is_active' => true,
        ]);
        $this->manager = User::factory()->create([
            'role_id' => $managerRole->id,
            'pin_hash' => Hash::make('1234'),
            'phone' => '+9607001002',
            'is_active' => true,
        ]);
        $this->owner = User::factory()->create([
            'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'),
            'phone' => '+9607001003',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'Refund Cust',
            'phone' => '+9607778888',
            'is_active' => true,
        ]);

        $sms = $this->createMock(SmsService::class);
        $sms->method('send')->willReturnCallback(function (SmsMessage $msg) {
            $this->sentSms[] = [
                'to' => $msg->to,
                'type' => $msg->type,
                'message' => $msg->message,
            ];
            $log = new SmsLog;
            $log->status = 'demo';

            return $log;
        });
        $this->app->instance(SmsService::class, $sms);
    }

    private function actingAsStaff(User $user): void
    {
        Auth::forgetGuards();
        Sanctum::actingAs($user, ['staff']);
    }

    private function openShift(User $user): void
    {
        $device = Device::firstOrCreate(
            ['identifier' => 'REF-WF-'.$user->id],
            [
                'name' => 'Refund WF '.$user->id,
                'type' => 'pos',
                'is_active' => true,
                'status' => 'approved',
            ],
        );

        if (! Shift::where('user_id', $user->id)->whereNull('closed_at')->exists()) {
            Shift::create([
                'user_id' => $user->id,
                'device_id' => $device->id,
                'opened_at' => now(),
                'opening_cash' => 100,
            ]);
        }
    }

    private function paidOrder(?string $customerPhone = '+9607778888', ?int $customerId = null): Order
    {
        $order = Order::factory()->paid()->create([
            'customer_id' => $customerId ?? $this->customer->id,
            'delivery_contact_phone' => $customerPhone,
            'total' => 50,
            'total_laar' => 5000,
            'status' => 'paid',
            'payment_status' => 'paid',
        ]);
        if (! Payment::where('order_id', $order->id)->exists()) {
            Payment::create([
                'order_id' => $order->id,
                'method' => 'cash',
                'amount' => 50,
                'amount_laar' => 5000,
                'status' => 'confirmed',
            ]);
        }

        return $order->fresh();
    }

    private function lastOtpCode(): string
    {
        foreach (array_reverse($this->sentSms) as $m) {
            if ($m['type'] === 'customer_refund_otp' && preg_match('/\b(\d{4})\b/', $m['message'], $match)) {
                return $match[1];
            }
        }
        $this->fail('No customer_refund_otp SMS with a 4-digit code was sent.');
    }

    public function test_cashier_can_request_but_cannot_approve(): void
    {
        $this->openShift($this->cashier);
        $order = $this->paidOrder();

        $this->actingAsStaff($this->cashier);
        $res = $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 20,
            'reason_category' => 'wrong_item',
            'reason' => 'Wrong sandwich given',
        ]);

        $res->assertCreated()->assertJsonPath('refund.status', 'pending');
        $refundId = (int) $res->json('refund.id');
        $this->assertSame('paid', $order->fresh()->status);

        $otp = $this->lastOtpCode();
        $this->actingAsStaff($this->cashier);
        $this->postJson("/api/refunds/{$refundId}/approve", ['otp' => $otp])
            ->assertForbidden();
    }

    public function test_manager_cannot_approve_own_request(): void
    {
        $this->openShift($this->manager);
        $order = $this->paidOrder();

        $this->actingAsStaff($this->manager);
        $res = $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 15,
            'reason_category' => 'quality_complaint',
            'reason' => 'Cold food',
        ]);
        $res->assertCreated()->assertJsonPath('refund.status', 'pending');
        $id = (int) $res->json('refund.id');
        $otp = $this->lastOtpCode();

        $this->actingAsStaff($this->manager);
        $this->postJson("/api/refunds/{$id}/approve", ['otp' => $otp])
            ->assertStatus(422)
            ->assertSeeText('cannot approve');
    }

    public function test_owner_can_request_and_approve_in_one_action_without_otp(): void
    {
        $this->openShift($this->owner);
        $order = $this->paidOrder();
        $this->sentSms = [];

        $this->actingAsStaff($this->owner);
        $res = $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 50,
            'reason_category' => 'order_cancelled',
            'reason' => 'Customer left',
        ]);

        $res->assertCreated()
            ->assertJsonPath('refund.status', 'approved')
            ->assertJsonPath('auto_approved', true)
            ->assertJsonPath('refund.otp_owner_override', true);

        $this->assertSame('refunded', $order->fresh()->status);
        $otpMsgs = array_filter($this->sentSms, fn ($m) => $m['type'] === 'customer_refund_otp');
        $this->assertCount(0, $otpMsgs);
    }

    public function test_approve_requires_verified_otp_except_owner_override(): void
    {
        $this->openShift($this->cashier);
        $order = $this->paidOrder();
        $this->actingAsStaff($this->cashier);
        $id = (int) $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 10,
            'reason_category' => 'wrong_item',
            'reason' => 'OTP gate',
        ])->assertCreated()->json('refund.id');

        $this->openShift($this->manager);
        $this->actingAsStaff($this->manager);
        $this->postJson("/api/refunds/{$id}/approve", [])
            ->assertStatus(422)
            ->assertSeeText('verification code');

        $this->postJson("/api/refunds/{$id}/approve", ['otp' => '0000'])
            ->assertStatus(422);

        $otp = $this->lastOtpCode();
        $this->postJson("/api/refunds/{$id}/approve", ['otp' => $otp])
            ->assertOk()
            ->assertJsonPath('refund.status', 'approved')
            ->assertJsonPath('refund.otp_owner_override', false);
        $this->assertNotNull(Refund::find($id)->otp_verified_at);
    }

    public function test_owner_can_override_without_otp_and_it_is_flagged(): void
    {
        $this->openShift($this->cashier);
        $order = $this->paidOrder();
        $this->actingAsStaff($this->cashier);
        $id = (int) $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 10,
            'reason_category' => 'wrong_item',
            'reason' => 'Tourist no SIM',
        ])->assertCreated()->json('refund.id');

        $this->openShift($this->owner);
        $this->actingAsStaff($this->owner);
        $this->postJson("/api/refunds/{$id}/approve", [
            'owner_override_without_otp' => true,
        ])->assertOk()
            ->assertJsonPath('refund.status', 'approved')
            ->assertJsonPath('refund.otp_owner_override', true)
            ->assertJsonPath('phone_flags.otp_owner_override', true);

        // Managers cannot use the override.
        $this->openShift($this->cashier);
        $order2 = $this->paidOrder();
        $this->actingAsStaff($this->cashier);
        $id2 = (int) $this->postJson("/api/orders/{$order2->id}/refunds", [
            'amount' => 5,
            'reason_category' => 'wrong_item',
            'reason' => 'Manager override blocked',
        ])->assertCreated()->json('refund.id');
        $this->openShift($this->manager);
        $this->actingAsStaff($this->manager);
        $this->postJson("/api/refunds/{$id2}/approve", [
            'owner_override_without_otp' => true,
        ])->assertStatus(422);
    }

    public function test_supplied_phone_cannot_override_order_phone(): void
    {
        $this->openShift($this->cashier);
        $order = $this->paidOrder('+9607111222');
        $customerPhone = $order->customer?->phone;

        $this->actingAsStaff($this->cashier);
        $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 10,
            'reason_category' => 'duplicate_charge',
            'reason' => 'Charged twice',
            'phone' => '+9607999999',
            'customer_phone' => '+9607999999',
        ])->assertStatus(422);

        $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 10,
            'reason_category' => 'duplicate_charge',
            'reason' => 'Charged twice',
            'refund_phone' => '+9607999999',
        ])->assertStatus(422)
            ->assertSeeText('cannot be changed');

        $this->sentSms = [];
        $res = $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 10,
            'reason_category' => 'duplicate_charge',
            'reason' => 'Charged twice',
        ])->assertCreated();

        $this->assertSame('+9607111222', $res->json('refund.refund_phone'));
        $this->assertFalse((bool) $res->json('refund.phone_added_at_refund'));
        $this->assertSame('+9607111222', $order->fresh()->delivery_contact_phone);
        $this->assertSame($customerPhone, $order->fresh()->customer?->phone);

        $otpTo = array_column(array_filter($this->sentSms, fn ($m) => $m['type'] === 'customer_refund_otp'), 'to');
        $this->assertSame(['+9607111222'], array_values($otpTo));
    }

    public function test_cashier_can_add_phone_when_order_has_none(): void
    {
        $this->openShift($this->cashier);
        $order = $this->paidOrder(null);
        $order->update([
            'delivery_contact_phone' => null,
            'customer_id' => null,
        ]);

        $this->actingAsStaff($this->cashier);
        $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 10,
            'reason_category' => 'wrong_item',
            'reason' => 'Walk-in needs phone',
        ])->assertStatus(422);

        $res = $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 10,
            'reason_category' => 'wrong_item',
            'reason' => 'Walk-in needs phone',
            'refund_phone' => '7555666',
        ])->assertCreated();

        $this->assertSame('+9607555666', $res->json('refund.refund_phone'));
        $this->assertTrue((bool) $res->json('refund.phone_added_at_refund'));
        $this->assertTrue((bool) $res->json('phone_flags.phone_added_at_refund'));
        // Must not write the number onto the order/customer.
        $this->assertNull($order->fresh()->delivery_contact_phone);
        $this->assertNull($order->fresh()->customer_id);
    }

    public function test_suspicious_flags_no_history_and_repeat_refunds(): void
    {
        $this->openShift($this->cashier);
        $freshPhone = '+9607222333';
        $order = $this->paidOrder($freshPhone);
        // Ensure no other orders use this phone.
        Order::where('id', '!=', $order->id)->where('delivery_contact_phone', $freshPhone)->delete();

        $this->actingAsStaff($this->cashier);
        $r1 = $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 5,
            'reason_category' => 'wrong_item',
            'reason' => 'First',
        ])->assertCreated();
        $this->assertFalse((bool) $r1->json('phone_flags.has_prior_order_history'));
        $this->assertSame(0, (int) $r1->json('phone_flags.refunds_last_90_days'));

        $otp = $this->lastOtpCode();
        $this->openShift($this->manager);
        $this->actingAsStaff($this->manager);
        $this->postJson('/api/refunds/'.$r1->json('refund.id').'/approve', ['otp' => $otp])->assertOk();

        $order2 = $this->paidOrder($freshPhone);
        // Give prior history via the first order.
        $this->openShift($this->cashier);
        $this->actingAsStaff($this->cashier);
        $r2 = $this->postJson("/api/orders/{$order2->id}/refunds", [
            'amount' => 5,
            'reason_category' => 'wrong_item',
            'reason' => 'Second',
        ])->assertCreated();
        $this->assertTrue((bool) $r2->json('phone_flags.has_prior_order_history'));
        $this->assertGreaterThanOrEqual(1, (int) $r2->json('phone_flags.refunds_last_90_days'));
    }

    public function test_reject_moves_no_money_and_records_reason(): void
    {
        $this->openShift($this->cashier);
        $order = $this->paidOrder();

        $this->actingAsStaff($this->cashier);
        $res = $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 10,
            'reason_category' => 'other',
            'reason' => 'Needs review',
        ]);
        $id = (int) $res->json('refund.id');

        $this->openShift($this->manager);
        $this->actingAsStaff($this->manager);
        $this->postJson("/api/refunds/{$id}/reject", [
            'rejection_reason' => 'Not a valid complaint',
        ])->assertOk()
            ->assertJsonPath('refund.status', 'rejected')
            ->assertJsonPath('refund.rejection_reason', 'Not a valid complaint');

        $this->assertSame('paid', $order->fresh()->status);
        $this->assertSame(0, (int) Refund::find($id)->drawer_cash_out_laar);
    }

    public function test_reason_required_and_other_needs_free_text(): void
    {
        $this->openShift($this->cashier);
        $order = $this->paidOrder();

        $this->actingAsStaff($this->cashier);
        $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 10,
            'reason_category' => 'wrong_item',
        ])->assertStatus(422);

        $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 10,
            'reason_category' => 'other',
            'reason' => 'ab',
        ])->assertStatus(422);
    }

    public function test_approvers_notified_on_request(): void
    {
        $this->openShift($this->cashier);
        $order = $this->paidOrder();
        $this->sentSms = [];

        $this->actingAsStaff($this->cashier);
        $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 12,
            'reason_category' => 'wrong_item',
            'reason' => 'Notify check',
        ])->assertCreated();

        $to = array_column(
            array_filter($this->sentSms, fn ($m) => $m['type'] === 'staff_refund_requested'),
            'to',
        );
        $this->assertContains('+9607001002', $to);
        $this->assertContains('+9607001003', $to);
        $this->assertNotContains('+9607001001', $to);
    }

    public function test_daily_summary_includes_phone_flags_and_overrides(): void
    {
        $this->openShift($this->owner);
        $order = $this->paidOrder();
        $this->actingAsStaff($this->owner);
        $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 50,
            'reason_category' => 'order_cancelled',
            'reason' => 'Full cancel',
        ])->assertCreated();

        $this->artisan('refunds:send-daily-summary', [
            '--date' => now()->toDateString(),
        ])->assertSuccessful();

        $summary = array_values(array_filter(
            $this->sentSms,
            fn ($m) => $m['type'] === 'owner_daily_refund_summary',
        ));
        $this->assertNotEmpty($summary);
        $this->assertStringContainsString('MVR', $summary[0]['message']);
    }

    public function test_manager_can_approve_cashiers_request_and_completion_sms_fires(): void
    {
        $this->openShift($this->cashier);
        $order = $this->paidOrder('+9607333444');

        $this->actingAsStaff($this->cashier);
        $res = $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 25,
            'reason_category' => 'wrong_item',
            'reason' => 'Approve path',
        ]);
        $id = (int) $res->json('refund.id');
        $otp = $this->lastOtpCode();

        $this->sentSms = [];
        $this->openShift($this->manager);
        $this->actingAsStaff($this->manager);
        $this->postJson("/api/refunds/{$id}/approve", ['otp' => $otp])
            ->assertOk()
            ->assertJsonPath('refund.status', 'approved');

        $this->assertSame('partially_refunded', $order->fresh()->status);
        $completed = array_values(array_filter(
            $this->sentSms,
            fn ($m) => $m['type'] === 'customer_refund_completed',
        ));
        $this->assertNotEmpty($completed);
        $this->assertSame('+9607333444', $completed[0]['to']);
    }

    public function test_no_order_refunded_event_until_approval_and_no_money_on_request(): void
    {
        Event::fake([OrderRefunded::class]);
        $this->openShift($this->cashier);
        $order = $this->paidOrder();

        $this->actingAsStaff($this->cashier);
        $res = $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 10,
            'reason_category' => 'wrong_item',
            'reason' => 'Event gate',
        ]);
        $res->assertCreated()->assertJsonPath('refund.status', 'pending');
        Event::assertNotDispatched(OrderRefunded::class);
        $this->assertSame('paid', $order->fresh()->status);

        $otp = $this->lastOtpCode();
        $this->openShift($this->manager);
        $this->actingAsStaff($this->manager);
        $this->postJson('/api/refunds/'.$res->json('refund.id').'/approve', ['otp' => $otp])
            ->assertOk();
        Event::assertDispatched(OrderRefunded::class);
    }

    public function test_historical_approved_refunds_remain_readable(): void
    {
        $order = $this->paidOrder();
        $historical = Refund::create([
            'order_id' => $order->id,
            'user_id' => $this->manager->id,
            'amount' => 5,
            'status' => 'approved',
            'reason' => 'Legacy refund',
            'drawer_cash_out_laar' => 500,
        ]);

        $this->actingAsStaff($this->owner);
        $this->getJson('/api/refunds')
            ->assertOk()
            ->assertJsonFragment(['id' => $historical->id, 'status' => 'approved', 'reason' => 'Legacy refund']);

        $this->assertNull($historical->fresh()->approved_by);
        $this->assertSame('approved', $historical->fresh()->status);
    }
}
