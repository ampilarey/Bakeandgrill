<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Domains\Finance\Services\RefundWorkflowService;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\CustomerDepositLedger;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Refund;
use App\Models\Role;
use App\Models\Shift;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Refund audit, 2026-09-25: a refund on a card / online order is not done
 * when it is approved — the money still has to be sent back by hand. Each
 * refund now carries its tender breakdown and the part owed externally,
 * the customer hears "on its way" then "completed" once it is marked paid
 * out, a rejection is announced, the report groups by category, deposit
 * payouts above a threshold need an owner, and card sales can be made to
 * carry a slip reference.
 */
class RefundExternalPayoutTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;

    private User $manager;

    private User $owner;

    private Customer $customer;

    private Device $device;

    /** @var list<array{to: string, type: string, message: string}> */
    private array $sentSms = [];

    protected function setUp(): void
    {
        parent::setUp();
        $staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $managerRole = Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'is_active' => true]);
        $ownerRole = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $make = fn (string $name, Role $role, string $phone) => User::factory()->create(['name' => $name, 'role_id' => $role->id, 'pin_hash' => Hash::make('1234'), 'phone' => $phone, 'is_active' => true]);
        $this->cashier = $make('Cashier', $staffRole, '+9607001001');
        $this->manager = $make('Manager', $managerRole, '+9607001002');
        $this->owner = $make('Owner', $ownerRole, '+9607001003');
        $this->customer = Customer::create(['name' => 'Aisha', 'phone' => '+9607778888', 'is_active' => true]);
        $this->device = Device::create(['name' => 'Till', 'identifier' => 'REF-EXT-POS', 'type' => 'pos', 'is_active' => true, 'status' => 'approved']);

        $sms = $this->createMock(SmsService::class);
        $sms->method('send')->willReturnCallback(function (SmsMessage $msg) {
            $this->sentSms[] = ['to' => $msg->to, 'type' => $msg->type, 'message' => $msg->message];
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
        if (!Shift::where('user_id', $user->id)->whereNull('closed_at')->exists()) {
            Shift::create(['user_id' => $user->id, 'device_id' => $this->device->id, 'opened_at' => now(), 'opening_cash' => 100]);
        }
    }

    /** @param array<string, int> $tenders method => laari */
    private function paidOrder(array $tenders, string $category = 'wrong_item'): Order
    {
        $total = array_sum($tenders);
        $order = Order::factory()->paid()->create([
            'customer_id' => $this->customer->id, 'delivery_contact_phone' => $this->customer->phone,
            'total' => $total / 100, 'total_laar' => $total, 'status' => 'paid', 'payment_status' => 'paid',
        ]);
        Payment::where('order_id', $order->id)->delete();
        foreach ($tenders as $method => $laar) {
            Payment::create(['order_id' => $order->id, 'method' => $method, 'amount' => $laar / 100, 'amount_laar' => $laar, 'status' => 'confirmed', 'reference_number' => $method === 'card' ? 'SLIP-1' : null]);
        }

        return $order->fresh();
    }

    /** @return list<string> */
    private function smsTypes(): array
    {
        return array_column($this->sentSms, 'type');
    }

    public function test_a_card_refund_is_owed_until_marked_paid_out_and_the_customer_hears_both_steps(): void
    {
        $order = $this->paidOrder(['card' => 3000, 'cash' => 2000]);

        // Owner requests + approves in one go: no shift needed, the cash share needs one though.
        $this->actingAsStaff($this->owner);
        $this->openShift($this->owner);
        $res = $this->postJson("/api/orders/{$order->id}/refunds", ['amount' => 50, 'reason_category' => 'wrong_item', 'reason' => 'Whole order wrong'])->assertCreated();
        $id = (int) $res->json('refund.id');
        $this->assertSame(3000, $res->json('breakdown.external_tender_laar'));
        $this->assertSame(2000, $res->json('breakdown.drawer_cash_out_laar'));

        $refund = Refund::findOrFail($id);
        $this->assertSame('approved', $refund->status);
        $this->assertSame(3000, $refund->external_tender_laar);
        $this->assertSame(2000, $refund->tender_breakdown['drawer_cash_out_laar']);
        $this->assertTrue($refund->isOwedExternally());
        $this->assertContains('customer_refund_on_its_way', $this->smsTypes());
        $this->assertNotContains('customer_refund_completed', $this->smsTypes(), 'not complete while MVR 30 is still owed');
        $onItsWay = collect($this->sentSms)->firstWhere('type', 'customer_refund_on_its_way');
        $this->assertStringContainsString('MVR 50.00', $onItsWay['message']);

        $list = $this->getJson('/api/refunds?owed=1')->assertOk();
        $this->assertSame(1, $list->json('meta.external_owed_count'));
        $this->assertSame(30.0, (float) $list->json('meta.external_owed_total'));
        $this->assertTrue($list->json('refunds.data.0.owed_externally'));
        $this->assertSame(3000, $list->json('refunds.data.0.tender_breakdown.external_tender_laar'));

        $this->sentSms = [];
        $this->postJson("/api/refunds/{$id}/paid-out", ['method' => 'bank_transfer', 'reference' => 'BML-7781'])->assertOk()
            ->assertJsonPath('refund.paid_out_method', 'bank_transfer')
            ->assertJsonPath('refund.paid_out_reference', 'BML-7781')
            ->assertJsonPath('refund.owed_externally', false);
        $this->assertSame(['customer_refund_completed'], $this->smsTypes());
        $this->assertSame($this->owner->id, Refund::findOrFail($id)->paid_out_by);
        $this->assertSame(0, $this->getJson('/api/refunds?owed=1')->json('meta.external_owed_count'));

        $this->postJson("/api/refunds/{$id}/paid-out", ['method' => 'cash'])->assertStatus(422); // already done
        $this->postJson("/api/refunds/{$id}/paid-out", ['method' => 'cheque'])->assertStatus(422); // not a method

        // A cash-only refund has nothing to pay out separately.
        $cashOrder = $this->paidOrder(['cash' => 1000]);
        $cashId = (int) $this->postJson("/api/orders/{$cashOrder->id}/refunds", ['amount' => 10, 'reason_category' => 'other', 'reason' => 'Spilled'])->assertCreated()->json('refund.id');
        $this->postJson("/api/refunds/{$cashId}/paid-out", ['method' => 'cash'])->assertStatus(422);
        $this->assertFalse(Refund::findOrFail($cashId)->isOwedExternally());
    }

    public function test_a_card_only_refund_can_be_approved_without_a_shift_and_a_cash_one_cannot(): void
    {
        $order = $this->paidOrder(['card' => 5000]);
        $this->actingAsStaff($this->cashier);
        $this->openShift($this->cashier);
        $id = (int) $this->postJson("/api/orders/{$order->id}/refunds", ['amount' => 50, 'reason_category' => 'duplicate_charge', 'reason' => 'Charged twice'])->assertCreated()->json('refund.id');
        $otp = null;
        foreach ($this->sentSms as $m) {
            if ($m['type'] === 'customer_refund_otp' && preg_match('/\b(\d{4})\b/', $m['message'], $mm)) {
                $otp = $mm[1];
            }
        }
        $this->assertNotNull($otp);

        // Manager with no open shift: fine, no cash leaves a drawer.
        $this->actingAsStaff($this->manager);
        $this->postJson("/api/refunds/{$id}/approve", ['otp' => $otp])->assertOk()->assertJsonPath('refund.status', 'approved');
        $this->assertSame(5000, Refund::findOrFail($id)->external_tender_laar);

        $cashOrder = $this->paidOrder(['cash' => 5000]);
        $this->actingAsStaff($this->cashier);
        $cashId = (int) $this->postJson("/api/orders/{$cashOrder->id}/refunds", ['amount' => 20, 'reason_category' => 'other', 'reason' => 'Late'])->assertCreated()->json('refund.id');
        $this->actingAsStaff($this->manager);
        $this->postJson("/api/refunds/{$cashId}/approve", ['otp' => '0000'])->assertStatus(422)
            ->assertJsonFragment(['message' => 'Open a shift before approving a refund that pays cash from the drawer.']);
    }

    public function test_the_customer_is_told_when_a_refund_is_rejected(): void
    {
        $order = $this->paidOrder(['cash' => 2000]);
        $this->actingAsStaff($this->cashier);
        $this->openShift($this->cashier);
        $id = (int) $this->postJson("/api/orders/{$order->id}/refunds", ['amount' => 20, 'reason_category' => 'other', 'reason' => 'Changed mind'])->assertCreated()->json('refund.id');
        $this->sentSms = [];
        $this->actingAsStaff($this->manager);
        $this->postJson("/api/refunds/{$id}/reject", ['rejection_reason' => 'Order was eaten'])->assertOk();
        $rejected = collect($this->sentSms)->firstWhere('type', 'customer_refund_rejected');
        $this->assertNotNull($rejected);
        $this->assertSame('+9607778888', $rejected['to']);
        $this->assertStringContainsString('was not approved', $rejected['message']);
    }

    public function test_an_online_self_cancel_is_owed_too(): void
    {
        $order = $this->paidOrder(['bml' => 4500]);
        $order->update(['type' => 'online_pickup', 'status' => 'paid']);
        $result = app(RefundWorkflowService::class)->refundFullyForCustomerSelfCancel($order->fresh(), $this->customer);
        $refund = $result['refund'];
        $this->assertSame(4500, $refund->external_tender_laar);
        $this->assertSame(0, $refund->drawer_cash_out_laar);
        $this->assertTrue($refund->fresh()->isOwedExternally());
        $this->assertContains('customer_refund_on_its_way', $this->smsTypes());
        $this->assertNotContains('customer_refund_completed', $this->smsTypes());
    }

    public function test_the_list_filters_by_date_and_search_and_no_longer_offers_processed(): void
    {
        $this->actingAsStaff($this->owner);
        $this->openShift($this->owner);
        $a = $this->paidOrder(['cash' => 1000]);
        $b = $this->paidOrder(['cash' => 1000]);
        $this->postJson("/api/orders/{$a->id}/refunds", ['amount' => 10, 'reason_category' => 'wrong_item', 'reason' => 'Cold chips'])->assertCreated();
        $this->postJson("/api/orders/{$b->id}/refunds", ['amount' => 5, 'reason_category' => 'other', 'reason' => 'Late delivery'])->assertCreated();

        $this->assertSame(1, $this->getJson('/api/refunds?q=chips')->assertOk()->json('refunds.total'));
        $this->assertSame(1, $this->getJson('/api/refunds?q=' . $b->order_number)->assertOk()->json('refunds.total'));
        $this->assertSame(2, $this->getJson('/api/refunds?q=7778888')->assertOk()->json('refunds.total'), 'by phone');
        $this->assertSame(0, $this->getJson('/api/refunds?from=' . now()->addDay()->toDateString())->assertOk()->json('refunds.total'));
        $this->assertSame(2, $this->getJson('/api/refunds?from=' . now()->toDateString() . '&to=' . now()->toDateString())->assertOk()->json('refunds.total'));
        $this->getJson('/api/refunds?status=processed')->assertStatus(422);
    }

    public function test_the_report_groups_approved_refunds_by_category(): void
    {
        $this->actingAsStaff($this->owner);
        $this->openShift($this->owner);
        foreach ([[1000, 'wrong_item', 'Cold'], [2000, 'wrong_item', 'Missing drink'], [500, 'other', 'Late']] as [$laar, $cat, $why]) {
            $o = $this->paidOrder(['cash' => $laar]);
            $this->postJson("/api/orders/{$o->id}/refunds", ['amount' => $laar / 100, 'reason_category' => $cat, 'reason' => $why])->assertCreated();
        }
        // A pending request from the cashier is not money that left.
        $this->actingAsStaff($this->cashier);
        $this->openShift($this->cashier);
        $p = $this->paidOrder(['cash' => 9000]);
        $this->postJson("/api/orders/{$p->id}/refunds", ['amount' => 90, 'reason_category' => 'quality_complaint', 'reason' => 'Burnt'])->assertCreated();

        $this->actingAsStaff($this->owner);
        $rows = $this->getJson('/api/reports/refunds-by-reason?from=' . now()->toDateString() . '&to=' . now()->toDateString())->assertOk()->json('rows');
        $this->assertSame(['wrong_item', 'other'], array_column($rows, 'category'));
        $this->assertSame('Wrong item', $rows[0]['reason']);
        $this->assertSame(2, $rows[0]['refunds_count']);
        $this->assertSame(30.0, (float) $rows[0]['amount']);
        $this->assertSame('Missing drink', $rows[0]['top_reasons'][0]['reason']);
    }

    public function test_deposit_payouts_above_the_threshold_need_an_owner_and_every_payout_texts_the_owners(): void
    {
        $this->actingAsStaff($this->manager);
        $this->openShift($this->manager);
        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/top-up", ['amount_mvr' => 1000, 'method' => 'cash', 'reference' => 'TOP'])->assertCreated();

        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/refund", ['amount_mvr' => 600, 'method' => 'cash', 'reason' => 'Wants it back'])
            ->assertStatus(422)->assertJsonFragment(['message' => 'Deposit payouts above MVR 500.00 need an owner. Ask an owner to record this one.']);
        $this->sentSms = [];
        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/refund", ['amount_mvr' => 200, 'method' => 'cash', 'reason' => 'Small one'])->assertCreated();
        $alert = collect($this->sentSms)->where('type', 'owner_deposit_payout')->values();
        $this->assertNotEmpty($alert);
        $this->assertStringContainsString('MVR 200.00 cash to Aisha by Manager', $alert[0]['message']);

        SiteSetting::set('deposit_payout_owner_threshold_mvr', '100');
        SiteSetting::bust();
        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/refund", ['amount_mvr' => 150, 'method' => 'bank_transfer', 'reason' => 'x'])->assertStatus(422);
        $this->actingAsStaff($this->owner);
        $this->openShift($this->owner);
        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/refund", ['amount_mvr' => 150, 'method' => 'bank_transfer', 'reason' => 'Owner did it'])->assertCreated();
        $this->assertSame(2, CustomerDepositLedger::where('type', 'payout')->count());

        // Yesterday's payouts and anything still owed by card show up in the owner's daily summary.
        $order = $this->paidOrder(['card' => 2500]);
        $this->postJson("/api/orders/{$order->id}/refunds", ['amount' => 25, 'reason_category' => 'other', 'reason' => 'Card one'])->assertCreated();
        $this->sentSms = [];
        $this->artisan('refunds:send-daily-summary', ['--date' => now()->toDateString()])->assertSuccessful();
        $summary = collect($this->sentSms)->firstWhere('type', 'owner_daily_refund_summary');
        $this->assertStringContainsString('OWED by card/bank: 1 refund, MVR 25.00', $summary['message']);
        $this->assertStringContainsString('Deposit payouts: 2, MVR 350.00', $summary['message']);
    }

    public function test_card_payments_need_a_reference_when_the_switch_is_on(): void
    {
        $category = Category::create(['name' => 'Food', 'slug' => 'food-ref', 'is_active' => true]);
        $item = Item::create(['category_id' => $category->id, 'name' => 'Pie', 'base_price' => 40.0, 'sku' => 'PIE-1', 'is_active' => true, 'is_available' => true]);
        $this->actingAsStaff($this->owner);
        $this->openShift($this->owner);
        $make = fn () => (int) $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson('/api/orders', ['type' => 'takeaway', 'device_identifier' => $this->device->identifier, 'items' => [['item_id' => $item->id, 'name' => 'Pie', 'quantity' => 1]]])
            ->assertCreated()->json('order.id');
        $pay = fn (int $orderId, array $row) => $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", ['payments' => [$row]]);

        $orderId = $make();
        $total = (float) Order::findOrFail($orderId)->total;
        $pay($orderId, ['method' => 'card', 'amount' => $total])->assertOk(); // switch off: fine

        SiteSetting::set('pos_card_reference_required', '1');
        SiteSetting::bust();
        $second = $make();
        $pay($second, ['method' => 'card', 'amount' => $total])->assertStatus(422)
            ->assertJsonFragment(['message' => 'Enter the card slip or approval reference for card payments.']);
        $pay($second, ['method' => 'cash', 'amount' => $total])->assertOk(); // cash never needs one
        $third = $make();
        $pay($third, ['method' => 'card', 'amount' => $total, 'reference_number' => 'APPR-4471'])->assertOk();
    }
}
