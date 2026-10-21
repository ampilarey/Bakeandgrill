<?php

declare(strict_types=1);

namespace Tests\Feature\Credit;

use App\Console\Commands\AlertCreditOverdue;
use App\Domains\Credit\Services\CreditPaymentService;
use App\Domains\Deposits\Support\DepositHolds;
use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Payments\Gateway\BmlConnectService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\CreditPayment;
use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\CustomerDepositAccount;
use App\Models\Device;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Role;
use App\Models\Shift;
use App\Models\User;
use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Mockery\MockInterface;
use Tests\TestCase;

/**
 * Spending the wallet and the credit account better (owner, 2026-10-21,
 * phase 3): part of an online order from the wallet with the card paying the
 * rest, the wallet first at checkout, the credit account paid online as a
 * whole from the app or the statement page, the monthly statement text, the
 * owners told at 30 and 60 days overdue, and the near-limit note.
 */
class CreditSpendTest extends TestCase
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

    private MockInterface $bml;

    private int $bankCalls = 0;

    /** What the bank answers when asked about a transaction. */
    private string $bankState = 'CONFIRMED';

    /** Where the last session opened would send the customer back. */
    private string $lastReturnUrl = '';

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        config(['app.url' => 'https://bakeandgrill.mv', 'frontend.order_status_url' => 'https://bakeandgrill.mv/order/orders']);

        $provider = Mockery::mock(SmsProviderInterface::class);
        $provider->shouldReceive('send')->andReturnUsing(function (string $to, string $text) {
            $this->texts[] = ['to' => $to, 'text' => $text];

            return [true, ['ok' => true], null];
        });
        $this->app->instance(SmsProviderInterface::class, $provider);

        $this->bml = Mockery::mock(BmlConnectService::class);
        $this->bml->shouldReceive('normalizeLocalId')->andReturnUsing(fn (string $id) => substr(preg_replace('/[^A-Za-z0-9]/', '', $id), 0, 50));
        $this->bml->shouldReceive('createPayment')->andReturnUsing(function (int $amountLaar, string $localId, ?string $currency = null, ?string $returnUrl = null) {
            $this->bankCalls++;
            $this->lastReturnUrl = (string) $returnUrl;

            return ['payment_url' => 'https://bml.test/pay/' . $this->bankCalls, 'transaction_id' => 'TX-' . $this->bankCalls, 'local_id' => $localId, 'return_url' => $returnUrl];
        });
        $this->bml->shouldReceive('getTransactionStatus')->andReturnUsing(fn (string $tx) => ['state' => $this->bankState, 'transactionId' => $tx]);
        $this->bml->shouldReceive('verifyWebhookSignature')->andReturn(true);
        $this->app->instance(BmlConnectService::class, $this->bml);

        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $make = fn (string $role, string $email, ?string $phone) => User::create([
            'name' => ucfirst($role),
            'email' => $email,
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', $role)->firstOrFail()->id,
            'pin_hash' => Hash::make('1234'),
            'phone' => $phone,
            'is_active' => true,
        ]);
        $this->owner = $make('owner', 'owner@spend.test', '7001000');
        $this->manager = $make('manager', 'manager@spend.test', null);
        $this->staff = $make('staff', 'staff@spend.test', null);

        $this->device = Device::create(['name' => 'Spend POS', 'identifier' => 'SPEND-POS', 'type' => 'pos', 'is_active' => true]);
        $category = Category::create(['name' => 'Spend Food', 'slug' => 'spend-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id, 'name' => 'Spend Item', 'base_price' => 50.0, 'sku' => 'SPD-001',
            'is_active' => true, 'is_available' => true,
        ]);
        $this->customer = Customer::create(['name' => 'Spend Customer', 'phone' => '9607700123', 'is_active' => true]);
    }

    // ── helpers ───────────────────────────────────────────────────────

    /** @return list<string> */
    private function textsTo(string $phone): array
    {
        $suffix = substr(preg_replace('/\D+/', '', $phone), -7);

        return array_values(array_map(
            fn (array $t) => $t['text'],
            array_filter($this->texts, fn (array $t) => str_ends_with(preg_replace('/\D+/', '', $t['to']), $suffix)),
        ));
    }

    private function asCustomer(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);
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
        $this->texts = [];
    }

    /** A sale of one item (MVR 50) on the customer's credit account at the till. */
    private function creditSale(): Order
    {
        $this->openShift($this->staff);
        $response = $this->withHeader('X-Device-Identifier', $this->device->identifier)->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'customer_id' => $this->customer->id,
            'items' => [['item_id' => $this->item->id, 'name' => $this->item->name, 'quantity' => 1]],
        ]);
        $response->assertCreated();
        $orderId = (int) $response->json('order.id');
        $order = Order::findOrFail($orderId);
        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'house_account', 'amount' => self::totalLaar($order) / 100]],
                'print_receipt' => false,
            ])
            ->assertOk();
        DeferAfterResponse::flushTestingCallbacks();

        return $order->fresh();
    }

    private function repayCash(int $laar): void
    {
        $this->openShift($this->owner);
        $this->postJson("/api/admin/customers/{$this->customer->id}/credit/repayments", ['amount_laar' => $laar, 'method' => 'cash'])->assertCreated();
        DeferAfterResponse::flushTestingCallbacks();
    }

    private static function totalLaar(Order $order): int
    {
        return (int) ($order->total_laar ?? round((float) $order->total * 100));
    }

    private static function mvr(int $laar): string
    {
        return number_format($laar / 100, 2, '.', ',');
    }

    private function wallet(int $laar): void
    {
        CustomerDepositAccount::create(['customer_id' => $this->customer->id, 'balance_laar' => $laar, 'status' => 'active']);
    }

    private function walletBalance(): int
    {
        return (int) (CustomerDepositAccount::where('customer_id', $this->customer->id)->value('balance_laar') ?? 0);
    }

    private function owed(): int
    {
        return (int) $this->customer->fresh()->credit_balance_laar;
    }

    /** An online pickup order waiting for payment, worth $laar. */
    private function onlineOrder(int $laar): Order
    {
        $order = Order::factory()->create([
            'customer_id' => $this->customer->id, 'type' => 'online_pickup', 'status' => 'payment_pending',
            'payment_status' => 'unpaid', 'total' => $laar / 100, 'total_laar' => $laar, 'subtotal' => $laar / 100, 'tax_amount' => 0,
        ]);
        Payment::query()->where('order_id', $order->id)->delete();

        return $order;
    }

    private function cardPaymentFor(Order $order): Payment
    {
        return Payment::query()->where('order_id', $order->id)->where('method', 'bml_connect')->latest('id')->firstOrFail();
    }

    private function webhook(Payment $payment, string $state = 'CONFIRMED'): \Illuminate\Testing\TestResponse
    {
        $body = json_encode([
            'transactionId' => $payment->provider_transaction_id,
            'localId' => $payment->local_id,
            'state' => $state,
            'amount' => (int) $payment->amount_laar,
            'currency' => 'MVR',
        ]);
        $res = $this->call('POST', '/api/payments/bml/webhook', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X-BML-Signature' => 'ok'], $body);
        DeferAfterResponse::flushTestingCallbacks();

        return $res;
    }

    /** @return array{token: string, payment: Payment} */
    private function startCreditPayFromApp(?int $amountLaar = null): array
    {
        $this->asCustomer();
        $res = $this->postJson('/api/customer/credit/pay', $amountLaar === null ? [] : ['amount_laar' => $amountLaar])->assertCreated();
        $token = (string) $res->json('credit_payment.token');
        $row = CreditPayment::where('token', $token)->firstOrFail();
        $payment = Payment::where('credit_payment_id', $row->id)->latest('id')->firstOrFail();

        return ['token' => $token, 'payment' => $payment];
    }

    private function overdueBy(Invoice $invoice, int $days): void
    {
        Invoice::whereKey($invoice->id)->update(['due_date' => now()->subDays($days)->toDateString()]);
    }

    // ── Part of an order from the wallet ──────────────────────────────

    public function test_part_of_an_order_comes_from_the_wallet_and_the_card_pays_the_rest(): void
    {
        $this->wallet(10000);
        $order = $this->onlineOrder(12000);
        $this->asCustomer();

        $this->postJson("/api/customer/orders/{$order->id}/hold-wallet")->assertOk()
            ->assertJsonPath('held_laar', 10000)->assertJsonPath('remaining_laar', 2000);
        // A second tap sizes the hold afresh, never on top of itself.
        $this->postJson("/api/customer/orders/{$order->id}/hold-wallet")->assertOk()->assertJsonPath('held_laar', 10000);
        $this->assertSame(1, Payment::where('order_id', $order->id)->where('method', DepositHolds::METHOD)->count());
        $this->assertSame(10000, $this->walletBalance(), 'nothing leaves the wallet on a hold');

        // The held money is not offered anywhere else meanwhile.
        $this->getJson('/api/customer/deposit')->assertOk()
            ->assertJsonPath('deposit.balance_mvr', 100)->assertJsonPath('deposit.held_mvr', 100)->assertJsonPath('deposit.available_mvr', 0);
        $other = $this->onlineOrder(5000);
        $this->postJson("/api/customer/orders/{$other->id}/hold-wallet")->assertUnprocessable();
        $this->postJson("/api/customer/orders/{$other->id}/pay-wallet")->assertUnprocessable();
        Sanctum::actingAs($this->owner, ['staff']);
        $this->getJson("/api/customers/{$this->customer->id}/pos-summary")->assertOk()
            ->assertJsonPath('deposit.held_laar', 10000)->assertJsonPath('deposit.available_laar', 0);

        // The card session is for what is left.
        $this->asCustomer();
        $this->postJson("/api/orders/{$order->id}/pay/bml")->assertOk();
        $card = $this->cardPaymentFor($order);
        $this->assertSame(2000, (int) $card->amount_laar);

        $this->webhook($card)->assertOk();
        $order->refresh();
        $this->assertSame('paid', $order->payment_status);
        $this->assertNotContains($order->status, ['payment_pending', 'cancelled']);
        $this->assertSame(0, $this->walletBalance(), 'the held money is taken once the card paid');
        $hold = Payment::where('order_id', $order->id)->where('method', DepositHolds::METHOD)->firstOrFail();
        $this->assertSame('paid', $hold->status);
        $this->assertDatabaseHas('customer_deposit_ledger', ['payment_id' => $hold->id, 'type' => 'usage', 'order_id' => $order->id]);
        $this->getJson('/api/customer/deposit')->assertOk()->assertJsonPath('deposit.held_mvr', 0);
    }

    public function test_a_card_that_fails_frees_the_held_money(): void
    {
        $this->wallet(10000);
        $order = $this->onlineOrder(12000);
        $this->asCustomer();
        $this->postJson("/api/customer/orders/{$order->id}/hold-wallet")->assertOk();
        $this->postJson("/api/orders/{$order->id}/pay/bml")->assertOk();

        $this->webhook($this->cardPaymentFor($order), 'FAILED')->assertOk();

        $this->assertSame('cancelled', $order->fresh()->status);
        $this->assertSame('cancelled', Payment::where('order_id', $order->id)->where('method', DepositHolds::METHOD)->value('status'));
        $this->assertSame(10000, $this->walletBalance());
        $this->getJson('/api/customer/deposit')->assertOk()->assertJsonPath('deposit.available_mvr', 100)->assertJsonPath('deposit.held_mvr', 0);
    }

    public function test_unticking_the_wallet_releases_the_hold_and_the_card_pays_it_all(): void
    {
        $this->wallet(10000);
        $order = $this->onlineOrder(12000);
        $this->asCustomer();
        $this->postJson("/api/customer/orders/{$order->id}/hold-wallet")->assertOk();

        $this->deleteJson("/api/customer/orders/{$order->id}/hold-wallet")->assertOk()->assertJsonPath('released', 1);
        $this->postJson("/api/orders/{$order->id}/pay/bml")->assertOk();
        $this->assertSame(12000, (int) $this->cardPaymentFor($order)->amount_laar);

        // Not the customer's order: refused either way.
        $stranger = Customer::create(['name' => 'Someone', 'phone' => '9607700999', 'is_active' => true]);
        $theirs = Order::factory()->create(['customer_id' => $stranger->id, 'status' => 'payment_pending']);
        $this->postJson("/api/customer/orders/{$theirs->id}/hold-wallet")->assertForbidden();
        $this->deleteJson("/api/customer/orders/{$theirs->id}/hold-wallet")->assertForbidden();
    }

    public function test_a_wallet_that_covers_the_order_is_not_held_but_paid(): void
    {
        $this->wallet(20000);
        $order = $this->onlineOrder(12000);
        $this->asCustomer();
        $this->postJson("/api/customer/orders/{$order->id}/hold-wallet")->assertUnprocessable();
        $this->postJson("/api/customer/orders/{$order->id}/pay-wallet")->assertOk()->assertJsonPath('balance_laar', 8000);
    }

    // ── Wallet first ──────────────────────────────────────────────────

    public function test_wallet_first_is_the_customers_own_choice_and_the_till_sees_it(): void
    {
        $this->wallet(5000);
        $this->asCustomer();
        $this->getJson('/api/customer/deposit')->assertOk()->assertJsonPath('deposit.wallet_first', false);

        $this->patchJson('/api/customer/profile', ['wallet_first' => true])->assertOk();
        $this->getJson('/api/customer/deposit')->assertOk()->assertJsonPath('deposit.wallet_first', true);

        Sanctum::actingAs($this->owner, ['staff']);
        $this->getJson("/api/customers/{$this->customer->id}/pos-summary")->assertOk()->assertJsonPath('deposit.wallet_first', true);

        $this->asCustomer();
        $this->patchJson('/api/customer/profile', ['wallet_first' => false])->assertOk();
        $this->assertFalse((bool) $this->customer->fresh()->wallet_first);
    }

    // ── The credit account paid online as a whole ─────────────────────

    public function test_the_app_shows_the_statement_and_pays_the_whole_balance_oldest_invoices_first(): void
    {
        $this->approve(50000);
        $first = $this->creditSale();
        $second = $this->creditSale();
        $firstInvoice = Invoice::where('order_id', $first->id)->where('type', 'sale')->firstOrFail();
        $secondInvoice = Invoice::where('order_id', $second->id)->where('type', 'sale')->firstOrFail();
        $this->overdueBy($firstInvoice, 10);
        $sale = self::totalLaar($first);
        $this->assertSame(2 * $sale, $this->owed());
        $this->texts = [];

        $this->asCustomer();
        $statement = $this->getJson('/api/customer/credit/statement')->assertOk()->json('statement');
        $this->assertEquals(2 * $sale / 100, $statement['balance_mvr']);
        $this->assertEquals($sale / 100, $statement['overdue_mvr']);
        $this->assertTrue($statement['can_pay_online']);
        $this->assertCount(2, $statement['invoices']);
        $this->assertTrue($statement['invoices'][0]['overdue']);
        $this->assertSame(10, $statement['invoices'][0]['days_overdue']);
        $this->assertStringStartsWith('https://bakeandgrill.mv/credit/', $statement['statement_url']);
        $this->assertStringContainsString('/invoices/' . $firstInvoice->token, (string) $statement['invoices'][0]['view_url']);

        ['token' => $token, 'payment' => $payment] = $this->startCreditPayFromApp();
        $this->assertSame(2 * $sale, (int) $payment->amount_laar);
        $this->assertNull($payment->order_id);
        $this->assertNull($payment->invoice_id);
        $this->assertStringContainsString('creditBack=app', $this->lastReturnUrl);
        // Asked before the bank has an answer: still pending (the ask heals a paid one).
        $this->bankState = 'CREATED';
        $this->getJson("/api/customer/credit/payments/{$token}")->assertOk()->assertJsonPath('credit_payment.status', 'pending');
        $this->assertSame(2 * $sale, $this->owed());

        $this->bankState = 'CONFIRMED';
        $this->webhook($payment)->assertOk();

        $this->assertSame(0, $this->owed());
        $row = CreditPayment::where('token', $token)->firstOrFail();
        $this->assertSame(CreditPayment::STATUS_PAID, $row->status);
        $this->assertSame($payment->id, (int) $row->payment_id);
        $this->assertNotNull($row->ledger_id);
        $this->assertSame(1, CustomerCreditLedger::where('customer_id', $this->customer->id)->where('type', 'payment')->count());
        $this->assertSame('paid', $firstInvoice->fresh()->status);
        $this->assertSame('paid', $secondInvoice->fresh()->status);
        $this->getJson("/api/customer/credit/payments/{$token}")->assertOk()
            ->assertJsonPath('credit_payment.status', 'paid')->assertJsonPath('credit_payment.balance_after_mvr', 0)->assertJsonPath('balance_mvr', 0);
        $texts = $this->textsTo($this->customer->phone);
        $this->assertCount(1, $texts, 'one payment, one text');
        $this->assertStringContainsString('MVR ' . self::mvr(2 * $sale) . ' received (online by card)', $texts[0]);

        // The bank repeating itself changes nothing.
        $this->webhook($payment)->assertOk();
        $this->assertSame(0, $this->owed());
        $this->assertSame(1, CustomerCreditLedger::where('customer_id', $this->customer->id)->where('type', 'payment')->count());

        // Nothing owed: nothing to pay.
        $this->postJson('/api/customer/credit/pay')->assertUnprocessable();
        $this->assertFalse($this->getJson('/api/customer/credit/statement')->assertOk()->json('statement.can_pay_online'));
    }

    public function test_part_of_the_balance_goes_oldest_first_and_more_than_is_owed_goes_to_the_wallet(): void
    {
        $this->approve(50000);
        $first = $this->creditSale();
        $second = $this->creditSale();
        $firstInvoice = Invoice::where('order_id', $first->id)->where('type', 'sale')->firstOrFail();
        $secondInvoice = Invoice::where('order_id', $second->id)->where('type', 'sale')->firstOrFail();

        $this->asCustomer();
        $this->postJson('/api/customer/credit/pay', ['amount_laar' => 999999])->assertUnprocessable();
        $this->postJson('/api/customer/credit/pay', ['amount_laar' => 0])->assertUnprocessable();

        $sale = self::totalLaar($first);
        ['payment' => $payment] = $this->startCreditPayFromApp(3000);
        $this->webhook($payment)->assertOk();
        $this->assertSame(2 * $sale - 3000, $this->owed());
        $this->assertSame($sale - 3000, (int) $firstInvoice->fresh()->balanceDueLaar());
        $this->assertSame($sale, (int) $secondInvoice->fresh()->balanceDueLaar());

        // Pay the rest online; before the bank answers, 50 is paid in cash at the till.
        ['token' => $token, 'payment' => $payment] = $this->startCreditPayFromApp();
        $this->assertSame(2 * $sale - 3000, (int) $payment->amount_laar);
        $this->repayCash(5000);
        $this->assertSame(2 * $sale - 8000, $this->owed());

        $this->webhook($payment)->assertOk();
        $this->assertSame(0, $this->owed());
        $this->assertSame(5000, $this->walletBalance(), 'what was over the balance is in the wallet');
        $this->assertDatabaseHas('customer_deposit_ledger', ['customer_id' => $this->customer->id, 'type' => 'top_up', 'payment_id' => $payment->id]);
        $this->assertSame(CreditPayment::STATUS_PAID, CreditPayment::where('token', $token)->value('status'));
    }

    public function test_the_statement_page_shows_what_is_owed_and_pays_by_card(): void
    {
        $this->approve(50000);
        $first = $this->creditSale();
        $this->creditSale();
        $firstInvoice = Invoice::where('order_id', $first->id)->where('type', 'sale')->firstOrFail();
        $this->overdueBy($firstInvoice, 3);
        $sale = self::totalLaar($first);
        $token = (string) $this->customer->fresh()->credit_statement_token;
        if ($token === '') {
            CreditPaymentService::statementUrl($this->customer);
            $token = (string) $this->customer->fresh()->credit_statement_token;
        }

        $page = $this->get("/credit/{$token}")->assertOk()
            ->assertSee('data-credit-statement="owing"', false)
            ->assertSee('MVR ' . self::mvr(2 * $sale))
            ->assertSee('MVR ' . self::mvr($sale) . ' overdue')
            ->assertSee($firstInvoice->invoice_number)
            ->assertSee('data-pay-cta="credit-statement"', false);
        $this->assertStringContainsString('no-store', (string) $page->headers->get('Cache-Control'));
        $this->get('/credit/nope')->assertNotFound();

        // Part of it from the page: the bank's page, and a statement-sourced row.
        $this->post("/credit/{$token}/pay", ['custom_mvr' => '30'])->assertRedirect('https://bml.test/pay/1');
        $row = CreditPayment::where('customer_id', $this->customer->id)->latest('id')->firstOrFail();
        $this->assertSame(3000, (int) $row->amount_laar);
        $this->assertSame(CreditPayment::SOURCE_STATEMENT, $row->source);
        $payment = Payment::where('credit_payment_id', $row->id)->firstOrFail();
        $this->assertStringContainsString('creditPayId=' . $row->id, $this->lastReturnUrl);
        $this->assertStringContainsString('creditBack=page', $this->lastReturnUrl);

        // Back from the bank with nothing yet from the webhook: the page asks the bank itself.
        $this->bankState = 'CONFIRMED';
        $this->get("/credit/{$token}?payment=CONFIRMED")->assertOk()
            ->assertSee('data-credit-banner="confirmed"', false)
            ->assertSee('MVR ' . self::mvr(2 * $sale - 3000));
        $this->assertSame(2 * $sale - 3000, $this->owed());
        $this->assertSame(CreditPayment::STATUS_PAID, $row->fresh()->status);
        $this->assertContains($payment->fresh()->status, ['confirmed', 'paid']);

        // More than is owed, or nothing typed that makes sense, is refused on the page.
        $this->post("/credit/{$token}/pay", ['custom_mvr' => '500'])->assertRedirectContains("/credit/{$token}");
        $this->assertSame(1, CreditPayment::where('customer_id', $this->customer->id)->count());

        // A payment that did not go through says so and nothing changes.
        $this->bankState = 'CANCELLED';
        $this->post("/credit/{$token}/pay", [])->assertRedirect('https://bml.test/pay/2');
        $this->get("/credit/{$token}?payment=CANCELLED")->assertOk()->assertSee('data-credit-banner="not-completed"', false);
        $this->assertSame(2 * $sale - 3000, $this->owed());
    }

    // ── The monthly statement text ────────────────────────────────────

    public function test_the_monthly_statement_texts_what_is_owed_and_the_link_once(): void
    {
        $this->approve(50000);
        $first = $this->creditSale();
        $this->creditSale();
        $this->overdueBy(Invoice::where('order_id', $first->id)->where('type', 'sale')->firstOrFail(), 5);
        $sale = self::totalLaar($first);
        $this->texts = [];

        $this->artisan('credit:send-statements', ['--month' => '2026-09'])->assertSuccessful();
        $texts = $this->textsTo($this->customer->phone);
        $this->assertCount(1, $texts);
        $this->assertStringContainsString('statement for September 2026', $texts[0]);
        $this->assertStringContainsString('you owe MVR ' . self::mvr(2 * $sale) . ', of which MVR ' . self::mvr($sale) . ' is overdue', $texts[0]);
        $this->assertStringContainsString('https://bakeandgrill.mv/credit/' . $this->customer->fresh()->credit_statement_token, $texts[0]);
        $this->assertDatabaseHas('sms_logs', ['customer_id' => $this->customer->id, 'type' => CreditPaymentService::TYPE_STATEMENT]);

        // The same month again: nothing more.
        $this->artisan('credit:send-statements', ['--month' => '2026-09'])->assertSuccessful();
        $this->assertCount(1, $this->textsTo($this->customer->phone));

        // Reminder texts off: left alone. Nothing owed: nothing sent.
        $this->customer->update(['credit_reminder_sms' => false]);
        $this->artisan('credit:send-statements', ['--month' => '2026-10'])->assertSuccessful();
        $this->assertCount(1, $this->textsTo($this->customer->phone));
        $this->customer->update(['credit_reminder_sms' => true]);
        $this->repayCash(2 * $sale);
        $this->texts = [];
        $this->artisan('credit:send-statements', ['--month' => '2026-10'])->assertSuccessful();
        $this->assertCount(0, $this->textsTo($this->customer->phone));
    }

    // ── The owners hear when credit goes overdue ──────────────────────

    public function test_the_owners_are_told_once_at_30_and_60_days_and_needs_attention_lists_it(): void
    {
        $this->approve(50000);
        $first = $this->creditSale();
        $invoice = Invoice::where('order_id', $first->id)->where('type', 'sale')->firstOrFail();
        $this->texts = [];

        $this->overdueBy($invoice, 10);
        $this->artisan('credit:alert-overdue')->assertSuccessful();
        $this->assertCount(0, $this->textsTo('7001000'), 'ten days late is for the customer reminder, not the owner');

        $this->overdueBy($invoice, 35);
        $this->artisan('credit:alert-overdue')->assertSuccessful();
        $owner = $this->textsTo('7001000');
        $this->assertCount(1, $owner);
        $this->assertStringContainsString('Credit overdue: Spend Customer: ' . $invoice->invoice_number . ' MVR ' . self::mvr(self::totalLaar($first)) . ' 35 days', $owner[0]);
        $this->assertStringContainsString('Customers → Accounts on credit', $owner[0]);
        $this->assertSame(30, (int) $invoice->fresh()->overdue_alert_stage);
        $this->assertDatabaseHas('sms_logs', ['type' => AlertCreditOverdue::TYPE]);

        $this->artisan('credit:alert-overdue')->assertSuccessful();
        $this->assertCount(1, $this->textsTo('7001000'), 'the same stage is not repeated');

        $this->overdueBy($invoice, 65);
        $this->artisan('credit:alert-overdue')->assertSuccessful();
        $this->assertCount(2, $this->textsTo('7001000'));
        $this->assertSame(60, (int) $invoice->fresh()->overdue_alert_stage);
        $this->artisan('credit:alert-overdue')->assertSuccessful();
        $this->assertCount(2, $this->textsTo('7001000'));

        Sanctum::actingAs($this->owner, ['staff']);
        $rows = collect($this->getJson('/api/admin/inbox')->assertOk()->json('rows'))->keyBy('key');
        $this->assertSame(1, $rows['credit_overdue']['count']);
        $this->assertSame('danger', $rows['credit_overdue']['level']);
        $this->assertSame('/customers/credit', $rows['credit_overdue']['link']);

        // Paid: the row goes.
        $this->repayCash(self::totalLaar($first));
        Sanctum::actingAs($this->owner, ['staff']);
        $keys = collect($this->getJson('/api/admin/inbox')->assertOk()->json('rows'))->pluck('key')->all();
        $this->assertNotContains('credit_overdue', $keys);
    }

    // ── The near-limit note ───────────────────────────────────────────

    public function test_the_charged_text_warns_when_a_fifth_of_the_limit_or_less_is_left(): void
    {
        $this->approve(12000);
        $first = $this->creditSale();
        $sale = self::totalLaar($first);
        $this->assertLessThan(12000 * 0.8, $sale, 'one sale leaves more than a fifth of the limit');
        $texts = $this->textsTo($this->customer->phone);
        $this->assertCount(1, $texts);
        $this->assertStringNotContainsString('limit is left', $texts[0], 'more than a fifth left: no warning');

        $this->texts = [];
        $this->creditSale();
        $left = 12000 - 2 * $sale;
        $this->assertLessThanOrEqual(12000 * 0.2, $left, 'two sales leave a fifth or less');
        $texts = $this->textsTo($this->customer->phone);
        $this->assertCount(1, $texts);
        $this->assertStringContainsString('Only MVR ' . self::mvr($left) . ' of your MVR 120.00 limit is left.', $texts[0]);
    }
}
