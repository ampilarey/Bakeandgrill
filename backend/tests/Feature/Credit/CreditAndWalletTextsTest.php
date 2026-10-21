<?php

declare(strict_types=1);

namespace Tests\Feature\Credit;

use App\Domains\Credit\Services\CreditAccountNotifier;
use App\Domains\Credit\Services\CreditOnlinePaymentService;
use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\Notifications\Support\SmsTemplateWording;
use App\Domains\Payments\Gateway\BmlConnectService;
use App\Domains\Payments\Services\PaymentService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Receipt;
use App\Models\Role;
use App\Models\Shift;
use App\Models\User;
use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

/**
 * Owner, 2026-10-21: a sale on credit said only "Receipt for #…", a
 * repayment said nothing, and the wallet never spoke. Now a credit sale is
 * told by its own text with the due date, the balance and a link to pay, a
 * repayment is acknowledged with what is left, every wallet movement is
 * told, and the reminders say Pay online with the whole balance.
 */
class CreditAndWalletTextsTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<array{to: string, text: string}> */
    private array $texts = [];

    private User $owner;

    private User $manager;

    private User $staff;

    private Device $device;

    private Item $item;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        config(['app.url' => 'https://bakeandgrill.mv']);

        $provider = Mockery::mock(SmsProviderInterface::class);
        $provider->shouldReceive('send')->andReturnUsing(function (string $to, string $text) {
            $this->texts[] = ['to' => $to, 'text' => $text];

            return [true, ['ok' => true], null];
        });
        $this->app->instance(SmsProviderInterface::class, $provider);

        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $make = fn (string $role, string $email) => User::create([
            'name' => ucfirst($role),
            'email' => $email,
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', $role)->firstOrFail()->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->owner = $make('owner', 'owner@texts.test');
        $this->manager = $make('manager', 'manager@texts.test');
        $this->staff = $make('staff', 'staff@texts.test');

        $this->device = Device::create(['name' => 'Texts POS', 'identifier' => 'TEXTS-POS', 'type' => 'pos', 'is_active' => true]);
        $category = Category::create(['name' => 'Texts Food', 'slug' => 'texts-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id, 'name' => 'Texts Item', 'base_price' => 50.0, 'sku' => 'TXT-001',
            'is_active' => true, 'is_available' => true,
        ]);
        $this->customer = Customer::create(['name' => 'Texts Customer', 'phone' => '9607700123']);
    }

    // ── helpers ───────────────────────────────────────────────────────

    /** @return list<string> */
    private function textsToCustomer(): array
    {
        $suffix = substr(preg_replace('/\D+/', '', (string) $this->customer->phone), -7);

        return array_values(array_map(
            fn (array $t) => $t['text'],
            array_filter($this->texts, fn (array $t) => str_ends_with(preg_replace('/\D+/', '', $t['to']), $suffix)),
        ));
    }

    private function openShift(User $user): void
    {
        Sanctum::actingAs($user, ['staff']);
        if (Shift::where('user_id', $user->id)->whereNull('closed_at')->doesntExist()) {
            $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();
        }
    }

    private function approve(int $limitLaar): void
    {
        Sanctum::actingAs($this->manager, ['staff']);
        $this->patchJson("/api/admin/customers/{$this->customer->id}/credit", ['action' => 'approve', 'credit_limit_laar' => $limitLaar])->assertOk();
        $this->customer->refresh();
        // The approval text is not under test here.
        $this->texts = [];
    }

    private function createOrder(): int
    {
        $response = $this->withHeader('X-Device-Identifier', $this->device->identifier)->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'customer_id' => $this->customer->id,
            'items' => [['item_id' => $this->item->id, 'name' => $this->item->name, 'quantity' => 1]],
        ]);
        $response->assertCreated();

        return (int) $response->json('order.id');
    }

    private static function totalLaar(Order $order): int
    {
        return (int) ($order->total_laar ?? round((float) $order->total * 100));
    }

    private static function mvr(int $laar): string
    {
        return number_format($laar / 100, 2, '.', ',');
    }

    private function pay(int $orderId, string $method): Order
    {
        $order = Order::findOrFail($orderId);
        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => $method, 'amount' => self::totalLaar($order) / 100]],
                'print_receipt' => false,
            ])
            ->assertOk();
        DeferAfterResponse::flushTestingCallbacks();

        return $order->fresh();
    }

    private function creditSale(): Order
    {
        $this->openShift($this->staff);

        return $this->pay($this->createOrder(), 'house_account');
    }

    private function topUp(int $laar, string $method = 'cash'): void
    {
        $this->openShift($this->manager);
        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/top-up", ['amount_laar' => $laar, 'method' => $method])->assertCreated();
        DeferAfterResponse::flushTestingCallbacks();
    }

    private function repay(int $laar, string $method = 'cash'): void
    {
        $this->openShift($this->owner);
        $this->postJson("/api/admin/customers/{$this->customer->id}/credit/repayments", ['amount_laar' => $laar, 'method' => $method])->assertCreated();
        DeferAfterResponse::flushTestingCallbacks();
    }

    // ── A sale on credit ──────────────────────────────────────────────

    public function test_a_sale_on_credit_is_told_by_its_own_text_with_the_due_date_the_balance_and_a_pay_link(): void
    {
        $this->approve(50000);
        $order = $this->creditSale();
        $invoice = Invoice::where('order_id', $order->id)->where('type', 'sale')->firstOrFail();

        $texts = $this->textsToCustomer();
        $this->assertCount(1, $texts, 'one sale, one text');
        $text = $texts[0];
        $this->assertStringContainsString('MVR ' . self::mvr(self::totalLaar($order)) . ' charged to your credit account for #' . $order->order_number, $text);
        $this->assertStringContainsString('due ' . $invoice->due_date->format('d M Y'), $text);
        $this->assertStringContainsString('You owe MVR ' . self::mvr(self::totalLaar($order)), $text);
        $this->assertStringContainsString('MVR ' . self::mvr(50000 - self::totalLaar($order)) . ' available', $text);
        $this->assertStringContainsString('https://bakeandgrill.mv/invoices/' . $invoice->token, $text);
        $this->assertStringNotContainsString('Receipt for #', $text);
        $this->assertDatabaseHas('sms_logs', ['customer_id' => $this->customer->id, 'type' => CreditAccountNotifier::TYPE_CHARGED]);
        $this->assertDatabaseMissing('sms_logs', ['customer_id' => $this->customer->id, 'type' => 'customer_payment_confirmed_pos']);
    }

    public function test_with_the_charged_text_switched_off_the_receipt_text_goes_as_before(): void
    {
        AlertSwitch::setAll(CreditAccountNotifier::TYPE_CHARGED, false);
        $this->approve(50000);
        $order = $this->creditSale();

        $texts = $this->textsToCustomer();
        $this->assertCount(1, $texts);
        $this->assertStringContainsString('Receipt for #' . $order->order_number, $texts[0]);
    }

    public function test_the_receipt_page_and_pdf_show_the_credit_account_block_with_pay_online(): void
    {
        $this->approve(50000);
        $order = $this->creditSale();
        $receipt = Receipt::where('order_id', $order->id)->firstOrFail();
        $invoice = Invoice::where('order_id', $order->id)->where('type', 'sale')->firstOrFail();

        $this->get('/receipts/' . $receipt->token)
            ->assertOk()
            ->assertSee('Credit account')
            ->assertSee($invoice->invoice_number)
            ->assertSee($invoice->due_date->format('d M Y'))
            ->assertSee('You owe on your account')
            ->assertSee('Pay online')
            ->assertSee('/invoices/' . $invoice->token, false);

        // Paid off: the page says so and offers nothing to pay.
        $this->repay(self::totalLaar($order));
        $this->get('/receipts/' . $receipt->token)
            ->assertOk()
            ->assertSee('This invoice is paid.')
            ->assertDontSee('data-pay-cta="credit-invoice"', false);
    }

    // ── A repayment ───────────────────────────────────────────────────

    public function test_a_repayment_texts_the_balance_left_and_the_next_due_date(): void
    {
        $this->approve(50000);
        $order = $this->creditSale();
        $invoice = Invoice::where('order_id', $order->id)->where('type', 'sale')->firstOrFail();
        $this->texts = [];

        $this->repay(2000);

        $texts = $this->textsToCustomer();
        $this->assertCount(1, $texts);
        $this->assertStringContainsString('MVR 20.00 received (cash) on your credit account', $texts[0]);
        $this->assertStringContainsString('You now owe MVR ' . self::mvr(self::totalLaar($order) - 2000), $texts[0]);
        $this->assertStringContainsString('Next payment due ' . $invoice->due_date->format('d M Y'), $texts[0]);
    }

    public function test_a_repayment_that_clears_the_account_says_so(): void
    {
        $this->approve(50000);
        $order = $this->creditSale();
        $this->texts = [];

        $this->repay(self::totalLaar($order), 'bank_transfer');

        $texts = $this->textsToCustomer();
        $this->assertCount(1, $texts);
        $this->assertStringContainsString('received (bank transfer). Your credit account is fully paid.', $texts[0]);
        $this->assertStringNotContainsString('Next payment', $texts[0]);
    }

    public function test_an_online_repayment_says_online_by_card(): void
    {
        $this->approve(50000);
        $order = $this->creditSale();
        $invoice = Invoice::where('order_id', $order->id)->where('type', 'sale')->firstOrFail();
        $this->texts = [];

        $bml = Mockery::mock(BmlConnectService::class);
        $bml->shouldReceive('normalizeLocalId')->andReturnUsing(fn ($v) => (string) $v);
        $bml->shouldReceive('createPayment')->once()->andReturn(['payment_url' => 'https://bml.test/pay/x', 'transaction_id' => 'txn-x', 'local_id' => 'BGINVX']);
        $this->app->instance(BmlConnectService::class, $bml);

        app(PaymentService::class)->initiateBmlInvoicePayment($invoice);
        $payment = Payment::where('invoice_id', $invoice->id)->firstOrFail();
        app(CreditOnlinePaymentService::class)->settleConfirmedBmlPayment($payment, $this->owner);
        DeferAfterResponse::flushTestingCallbacks();

        $texts = $this->textsToCustomer();
        $this->assertCount(1, $texts);
        $this->assertStringContainsString('received (online by card)', $texts[0]);
        $this->assertStringContainsString('fully paid', $texts[0]);
    }

    public function test_money_moved_from_the_wallet_to_the_account_says_from_your_wallet(): void
    {
        $this->approve(50000);
        $this->topUp(20000);
        $order = $this->creditSale();
        $this->texts = [];

        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/transfer-to-credit", ['amount_laar' => self::totalLaar($order)])->assertSuccessful();
        DeferAfterResponse::flushTestingCallbacks();

        $texts = $this->textsToCustomer();
        $this->assertCount(1, $texts, 'the repayment text alone: a transfer is not a payout');
        $this->assertStringContainsString('received (from your wallet)', $texts[0]);
        $this->assertStringContainsString('fully paid', $texts[0]);
    }

    // ── The wallet ────────────────────────────────────────────────────

    public function test_the_wallet_speaks_when_money_is_added_paid_out_put_on_hold_and_active_again(): void
    {
        $this->topUp(10000);
        $this->assertSame(['Bake & Grill: MVR 100.00 added to your wallet (cash). Wallet balance: MVR 100.00.'], $this->textsToCustomer());

        $this->texts = [];
        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/refund", ['amount_laar' => 4000, 'method' => 'bank_transfer', 'reason' => 'Customer asked for it back'])->assertSuccessful();
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertSame(['Bake & Grill: MVR 40.00 paid out from your wallet (bank transfer). Wallet balance: MVR 60.00.'], $this->textsToCustomer());

        $this->texts = [];
        $this->patchJson("/api/admin/customers/{$this->customer->id}/deposit", ['action' => 'set_status', 'status' => 'frozen'])->assertSuccessful();
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertSame(['Bake & Grill: your wallet has been put on hold and cannot be used for now. Please contact us.'], $this->textsToCustomer());

        $this->texts = [];
        $this->patchJson("/api/admin/customers/{$this->customer->id}/deposit", ['action' => 'set_status', 'status' => 'active'])->assertSuccessful();
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertSame(['Bake & Grill: your wallet is active again. Balance: MVR 60.00.'], $this->textsToCustomer());

        $this->assertDatabaseHas('sms_logs', ['customer_id' => $this->customer->id, 'type' => 'customer_deposit_received']);
        $this->assertDatabaseHas('sms_logs', ['customer_id' => $this->customer->id, 'type' => 'customer_deposit_paid_out']);
        $this->assertSame(2, DB::table('sms_logs')->where('customer_id', $this->customer->id)->where('type', 'customer_deposit_on_hold')->count());
    }

    public function test_a_till_sale_paid_from_the_wallet_carries_the_balance_left_in_the_receipt_text(): void
    {
        $this->topUp(10000);
        $this->texts = [];

        $this->openShift($this->staff);
        $order = $this->pay($this->createOrder(), 'wallet');

        $texts = $this->textsToCustomer();
        $this->assertCount(1, $texts, 'one sale, one text');
        $this->assertStringContainsString('Receipt for #' . $order->order_number, $texts[0]);
        $this->assertStringContainsString(
            'MVR ' . self::mvr(self::totalLaar($order)) . ' from your wallet, balance MVR ' . self::mvr(10000 - self::totalLaar($order)) . '.',
            $texts[0],
        );
    }

    // ── Reminders ─────────────────────────────────────────────────────

    public function test_reminders_say_pay_online_and_carry_the_whole_balance(): void
    {
        $this->approve(50000);
        $first = $this->creditSale();
        $second = $this->creditSale();
        $owed = self::totalLaar($first) + self::totalLaar($second);
        $invoice = Invoice::where('order_id', $first->id)->where('type', 'sale')->firstOrFail();
        $today = now()->toDateString();
        $invoice->update(['due_date' => $today, 'status' => 'sent']);
        $this->texts = [];

        $this->artisan('credit:send-payment-reminders', ['--date' => $today])->assertSuccessful();

        $texts = $this->textsToCustomer();
        $this->assertCount(1, $texts);
        $this->assertStringContainsString('due today', $texts[0]);
        $this->assertStringContainsString('You owe MVR ' . number_format($owed / 100, 2, '.', '') . ' in all', $texts[0]);
        $this->assertStringContainsString('Pay online: https://bakeandgrill.mv/invoices/' . $invoice->token, $texts[0]);
    }

    public function test_a_reminder_by_hand_goes_to_a_customer_who_stopped_offer_texts_and_fits_the_invoice(): void
    {
        $this->approve(50000);
        $order = $this->creditSale();
        $invoice = Invoice::where('order_id', $order->id)->where('type', 'sale')->firstOrFail();
        $this->customer->update(['sms_opt_out' => true]);
        $this->texts = [];

        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson("/api/admin/customers/{$this->customer->id}/credit/remind")->assertSuccessful();

        $texts = $this->textsToCustomer();
        $this->assertCount(1, $texts);
        // Not yet overdue: the "due on" wording, never "0 days overdue".
        $this->assertStringContainsString('due on ' . $invoice->due_date->format('d M Y'), $texts[0]);
        $this->assertStringNotContainsString('overdue', $texts[0]);
        $this->assertStringContainsString('Pay online: https://bakeandgrill.mv/invoices/' . $invoice->token, $texts[0]);
    }

    public function test_a_wording_the_owner_edited_is_kept_when_the_seed_moves_on(): void
    {
        DB::table('sms_templates')->insert([
            'slug' => 'texts_test_wording', 'name' => 'Test', 'type' => 'order_notification', 'body' => 'Owner words',
            'is_system' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->assertFalse(SmsTemplateWording::replaceIfUnchanged('texts_test_wording', ['Seed words'], 'New words'));
        $this->assertSame('Owner words', DB::table('sms_templates')->where('slug', 'texts_test_wording')->value('body'));

        DB::table('sms_templates')->where('slug', 'texts_test_wording')->update(['body' => 'Seed words']);
        $this->assertTrue(SmsTemplateWording::replaceIfUnchanged('texts_test_wording', ['Seed words'], 'New words'));
        $this->assertSame('New words', DB::table('sms_templates')->where('slug', 'texts_test_wording')->value('body'));

        $this->assertFalse(SmsTemplateWording::replaceIfUnchanged('no_such_wording', ['x'], 'y'));
        $this->assertTrue(SmsTemplateWording::ensure(['slug' => 'texts_test_new', 'name' => 'New', 'body' => 'Hello']));
        $this->assertFalse(SmsTemplateWording::ensure(['slug' => 'texts_test_new', 'name' => 'New', 'body' => 'Hello again']));
        $this->assertSame('Hello', DB::table('sms_templates')->where('slug', 'texts_test_new')->value('body'));
    }
}
