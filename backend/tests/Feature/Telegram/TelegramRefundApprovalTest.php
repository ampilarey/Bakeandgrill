<?php

declare(strict_types=1);

namespace Tests\Feature\Telegram;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Refund;
use App\Models\Shift;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Refunds waiting for a decision, from Telegram. The owner may approve a
 * refund that takes no cash from a drawer (the same owner override Admin
 * has); a cash one is approved at the till. Anyone with refund rights may
 * reject, with the reason the customer is told.
 */
class TelegramRefundApprovalTest extends TestCase
{
    use FakesTelegram;
    use RefreshDatabase;

    private User $owner;

    private User $cashier;

    private Device $device;

    protected function setUp(): void
    {
        parent::setUp();
        $this->roles();
        $this->fakeTelegram();

        $this->owner = $this->staff('owner', '+9607820288', 'Owner');
        $this->cashier = $this->staff('staff', '+9607001001', 'Mariyam');
        $this->device = Device::create(['name' => 'Till', 'identifier' => 'TG-REF-POS', 'type' => 'pos', 'is_active' => true, 'status' => 'approved']);

        $sms = $this->createMock(SmsService::class);
        $sms->method('send')->willReturnCallback(function (SmsMessage $msg) {
            $log = new SmsLog;
            $log->status = 'demo';

            return $log;
        });
        $this->app->instance(SmsService::class, $sms);
    }

    /** A refund the cashier asked for on an order paid with these tenders (laari). */
    private function pendingRefund(array $tenders): Refund
    {
        $customer = Customer::create(['name' => 'Aisha', 'phone' => '+9607778888', 'is_active' => true]);
        $total = array_sum($tenders);
        $order = Order::factory()->paid()->create([
            'customer_id' => $customer->id, 'delivery_contact_phone' => $customer->phone,
            'total' => $total / 100, 'total_laar' => $total, 'status' => 'paid', 'payment_status' => 'paid',
        ]);
        Payment::where('order_id', $order->id)->delete();
        foreach ($tenders as $method => $laar) {
            Payment::create(['order_id' => $order->id, 'method' => $method, 'amount' => $laar / 100, 'amount_laar' => $laar, 'status' => 'confirmed', 'reference_number' => $method === 'card' ? 'SLIP-1' : null]);
        }

        Auth::forgetGuards();
        Sanctum::actingAs($this->cashier, ['staff']);
        Shift::create(['user_id' => $this->cashier->id, 'device_id' => $this->device->id, 'opened_at' => now(), 'opening_cash' => 100]);
        $id = (int) $this->postJson("/api/orders/{$order->id}/refunds", ['amount' => $total / 100, 'reason_category' => 'wrong_item', 'reason' => 'Wrong burger'])
            ->assertCreated()->json('refund.id');
        Auth::forgetGuards();

        return Refund::findOrFail($id);
    }

    /** @return list<string> */
    private function buttonData(array $message): array
    {
        return array_column(array_merge(...($message['reply_markup']['inline_keyboard'] ?? [[]])), 'callback_data');
    }

    public function test_the_owner_approves_a_card_refund_from_telegram_after_confirming(): void
    {
        $refund = $this->pendingRefund(['card' => 5000]);
        $bot = $this->bot();
        $this->link($bot, $this->owner, '5550001');

        $this->telegramText($bot, '5550001', '✅ Approvals')->assertOk();
        $sent = $this->sent('5550001');
        $card = end($sent);
        $this->assertStringContainsString('Refund MVR 50.00', $card['text']);
        $this->assertStringContainsString('Asked by Mariyam', $card['text']);
        $this->assertSame(['rfa:' . $refund->id, 'rfr:' . $refund->id], $this->buttonData($card));

        // First tap only asks.
        $this->telegramButton($bot, '5550001', 'rfa:' . $refund->id)->assertOk();
        $this->assertSame('pending', $refund->fresh()->status);
        $edit = collect($this->telegramCalls)->where('method', 'editMessageText')->last();
        $this->assertStringContainsString("without the customer's code?", $edit['params']['text']);

        $this->telegramButton($bot, '5550001', 'rfy:' . $refund->id)->assertOk();
        $fresh = $refund->fresh();
        $this->assertSame('approved', $fresh->status);
        $this->assertTrue((bool) $fresh->otp_owner_override);
        $this->assertSame($this->owner->id, (int) $fresh->approved_by);
    }

    public function test_a_cash_refund_has_no_approve_button_and_cannot_be_forced(): void
    {
        $refund = $this->pendingRefund(['cash' => 3000]);
        $bot = $this->bot();
        $this->link($bot, $this->owner, '5550001');

        $this->telegramText($bot, '5550001', '/approvals')->assertOk();
        $sent = $this->sent('5550001');
        $card = end($sent);
        $this->assertStringContainsString('approve it at the till', $card['text']);
        $this->assertSame(['rfr:' . $refund->id], $this->buttonData($card));

        $this->telegramButton($bot, '5550001', 'rfy:' . $refund->id)->assertOk();
        $this->assertSame('pending', $refund->fresh()->status);
    }

    public function test_rejecting_asks_for_the_reason_and_records_it(): void
    {
        $refund = $this->pendingRefund(['card' => 5000]);
        $bot = $this->bot();
        $this->link($bot, $this->owner, '5550001');

        $this->telegramButton($bot, '5550001', 'rfr:' . $refund->id)->assertOk();
        $this->assertStringContainsString('Type the reason', $this->lastText('5550001'));
        $this->assertSame('pending', $refund->fresh()->status);

        $this->telegramText($bot, '5550001', 'Burger was eaten, not wrong')->assertOk();
        $fresh = $refund->fresh();
        $this->assertSame('rejected', $fresh->status);
        $this->assertSame('Burger was eaten, not wrong', $fresh->rejection_reason);
        $this->assertStringContainsString('Rejected', $this->lastText('5550001'));
    }

    public function test_a_menu_button_cancels_a_pending_rejection(): void
    {
        $refund = $this->pendingRefund(['card' => 5000]);
        $bot = $this->bot();
        $this->link($bot, $this->owner, '5550001');

        $this->telegramButton($bot, '5550001', 'rfr:' . $refund->id)->assertOk();
        $this->telegramText($bot, '5550001', '❓ Help')->assertOk();
        $this->telegramText($bot, '5550001', 'Some text later')->assertOk();

        $this->assertSame('pending', $refund->fresh()->status);
    }

    public function test_a_manager_can_reject_but_not_approve_from_telegram(): void
    {
        $manager = $this->staff('manager', '+9607001002', 'Manager');
        $refund = $this->pendingRefund(['card' => 5000]);
        $bot = $this->bot();
        $this->link($bot, $manager, '5550002');

        $this->telegramText($bot, '5550002', '/approvals')->assertOk();
        $sent = $this->sent('5550002');
        $this->assertSame(['rfr:' . $refund->id], $this->buttonData(end($sent)));

        $this->telegramButton($bot, '5550002', 'rfy:' . $refund->id)->assertOk();
        $this->assertSame('pending', $refund->fresh()->status);
    }
}
