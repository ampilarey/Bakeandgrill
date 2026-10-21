<?php

declare(strict_types=1);

namespace Tests\Feature\Deposits;

use App\Domains\Deposits\Services\WalletTopUpService;
use App\Domains\Deposits\Support\WalletTopUpRules;
use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Payments\Gateway\BmlConnectService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use App\Models\CustomerDepositAccount;
use App\Models\CustomerDepositLedger;
use App\Models\Payment;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use App\Models\WalletTopUp;
use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Mockery\MockInterface;
use Tests\TestCase;

/**
 * Money into the wallet by card (owner, 2026-10-21: "when customer log in,
 * option to pay deposit to his acc"). The order app's Add money, the link
 * staff send, the public page, the bank's three ways of telling us, the
 * rules the owner sets, and the texts.
 */
class WalletTopUpTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<array{to: string, text: string}> */
    private array $texts = [];

    private User $owner;

    private User $manager;

    private User $staff;

    private Customer $customer;

    private MockInterface $bml;

    private int $bankCalls = 0;

    /** What the bank answers when asked about a transaction. */
    private string $bankState = 'CONFIRMED';

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

        // The bank: every session opens, every status question says CONFIRMED
        // unless a test says otherwise, every webhook signature passes.
        $this->bml = Mockery::mock(BmlConnectService::class);
        $this->bml->shouldReceive('normalizeLocalId')->andReturnUsing(fn (string $id) => substr(preg_replace('/[^A-Za-z0-9]/', '', $id), 0, 50));
        $this->bml->shouldReceive('createPayment')->andReturnUsing(function (int $amountLaar, string $localId, ?string $currency = null, ?string $returnUrl = null) {
            $this->bankCalls++;

            return ['payment_url' => 'https://bml.test/pay/' . $this->bankCalls, 'transaction_id' => 'TX-' . $this->bankCalls, 'local_id' => $localId, 'return_url' => $returnUrl];
        });
        $this->bml->shouldReceive('getTransactionStatus')->andReturnUsing(fn (string $tx) => ['state' => $this->bankState, 'transactionId' => $tx]);
        $this->bml->shouldReceive('verifyWebhookSignature')->andReturn(true);
        $this->app->instance(BmlConnectService::class, $this->bml);

        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $make = fn (string $role, string $email) => User::create([
            'name' => ucfirst($role),
            'email' => $email,
            'password' => bcrypt('password'),
            'role_id' => Role::where('slug', $role)->firstOrFail()->id,
            'pin_hash' => bcrypt('1234'),
            'phone' => $role === 'owner' ? '7001000' : null,
            'is_active' => true,
        ]);
        $this->owner = $make('owner', 'owner@wallet.test');
        $this->manager = $make('manager', 'manager@wallet.test');
        $this->staff = $make('staff', 'staff@wallet.test');

        $this->customer = Customer::create(['name' => 'Wallet Customer', 'phone' => '9607700321', 'is_active' => true]);
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

    private function asCustomer(?Customer $customer = null): void
    {
        Sanctum::actingAs($customer ?? $this->customer, ['customer']);
    }

    /** @return array{token: string, payment: Payment} */
    private function startFromApp(int $amountLaar): array
    {
        $this->asCustomer();
        $res = $this->postJson('/api/customer/wallet/top-ups', ['amount_laar' => $amountLaar])->assertCreated();
        $token = (string) $res->json('top_up.token');
        $topUp = WalletTopUp::where('token', $token)->firstOrFail();

        return ['token' => $token, 'payment' => Payment::where('wallet_topup_id', $topUp->id)->latest('id')->firstOrFail()];
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

    private function balance(): int
    {
        return (int) (CustomerDepositAccount::where('customer_id', $this->customer->id)->value('balance_laar') ?? 0);
    }

    // ── The rules ─────────────────────────────────────────────────────

    public function test_the_rules_say_what_the_app_may_offer(): void
    {
        $this->asCustomer();
        $rules = $this->getJson('/api/customer/wallet/top-ups/rules')->assertOk()->json('rules');
        $this->assertTrue($rules['enabled']);
        $this->assertTrue($rules['can_top_up']);
        $this->assertEquals([100, 200, 500, 1000], $rules['presets_mvr']);
        $this->assertEquals(50, $rules['min_mvr']);
        $this->assertEquals(5000, $rules['max_mvr']);
        $this->assertEquals(10000, $rules['daily_cap_mvr']);
        $this->assertEquals(20000, $rules['max_balance_mvr']);

        // The owner changes them on Settings → Credit & wallet.
        Sanctum::actingAs($this->owner, ['staff']);
        $this->putJson('/api/site-settings', ['settings' => [
            WalletTopUpRules::PRESETS => '50, 150, 300',
            WalletTopUpRules::MIN => '50',
            WalletTopUpRules::MAX => '300',
        ]])->assertOk();
        $this->asCustomer();
        $rules = $this->getJson('/api/customer/wallet/top-ups/rules')->assertOk()->json('rules');
        $this->assertEquals([50, 150, 300], $rules['presets_mvr']);
        $this->assertEquals(300, $rules['max_mvr']);

        // A number nobody checked may not add money: the account could be set aside.
        $guest = Customer::create(['name' => 'Guest', 'phone' => '9607700999', 'is_active' => true]);
        $guest->forceFill(['phone_unverified' => true])->save();
        $this->asCustomer($guest);
        $rules = $this->getJson('/api/customer/wallet/top-ups/rules')->assertOk()->json('rules');
        $this->assertFalse($rules['can_top_up']);
        $this->assertSame('verify_phone', $rules['reason']);

        // Switched off, nothing is offered.
        SiteSetting::set(WalletTopUpRules::ENABLED, '0');
        $this->asCustomer();
        $rules = $this->getJson('/api/customer/wallet/top-ups/rules')->assertOk()->json('rules');
        $this->assertFalse($rules['enabled']);
        $this->assertSame('off', $rules['reason']);
    }

    public function test_the_rules_refuse_what_they_should(): void
    {
        $this->asCustomer();
        $this->postJson('/api/customer/wallet/top-ups', ['amount_laar' => 2000])->assertStatus(422)->assertJsonFragment(['message' => 'The smallest top-up is MVR 50.00.']);
        $this->postJson('/api/customer/wallet/top-ups', ['amount_laar' => 600000])->assertStatus(422)->assertJsonFragment(['message' => 'The largest top-up is MVR 5,000.00.']);

        // The wallet may hold up to MVR 20,000.
        $account = CustomerDepositAccount::create(['customer_id' => $this->customer->id, 'balance_laar' => 1990000, 'status' => 'active']);
        $this->postJson('/api/customer/wallet/top-ups', ['amount_laar' => 20000])->assertStatus(422)->assertJsonFragment(['message' => 'Your wallet can hold up to MVR 20,000.00; it has MVR 19,900.00 now.']);
        $account->update(['balance_laar' => 0]);

        // MVR 10,000 a day by card.
        WalletTopUp::create(['customer_id' => $this->customer->id, 'token' => WalletTopUp::newToken(), 'amount_laar' => 900000, 'status' => 'paid', 'source' => 'app', 'paid_at' => now()]);
        $this->postJson('/api/customer/wallet/top-ups', ['amount_laar' => 200000])->assertStatus(422)->assertJsonFragment(['message' => 'Card top-ups are limited to MVR 10,000.00 a day; MVR 9,000.00 so far today.']);
        $this->postJson('/api/customer/wallet/top-ups', ['amount_laar' => 100000])->assertCreated();

        // A wallet on hold takes nothing.
        $account->update(['status' => 'frozen']);
        $this->postJson('/api/customer/wallet/top-ups', ['amount_laar' => 10000])->assertStatus(422)->assertJsonFragment(['message' => 'Your wallet is on hold. Please contact us.']);
        $account->update(['status' => 'active']);

        // Nor does a number nobody checked.
        $this->customer->forceFill(['phone_unverified' => true])->save();
        $this->postJson('/api/customer/wallet/top-ups', ['amount_laar' => 10000])->assertStatus(422)->assertJsonFragment(['message' => 'Verify your number before adding money to your wallet.']);
        $this->customer->forceFill(['phone_unverified' => false])->save();

        SiteSetting::set(WalletTopUpRules::ENABLED, '0');
        $this->postJson('/api/customer/wallet/top-ups', ['amount_laar' => 10000])->assertStatus(422)->assertJsonFragment(['message' => 'Adding money by card is not available right now.']);
    }

    // ── From the app ──────────────────────────────────────────────────

    public function test_a_customer_starts_a_top_up_and_is_sent_to_the_bank(): void
    {
        $this->asCustomer();
        $res = $this->postJson('/api/customer/wallet/top-ups', ['amount_laar' => 50000])->assertCreated();
        $this->assertSame('https://bml.test/pay/1', $res->json('payment_url'));
        $this->assertSame('pending', $res->json('top_up.status'));
        $this->assertEquals(500, $res->json('top_up.amount_mvr'));
        $this->assertTrue($res->json('top_up.amount_fixed'));

        $topUp = WalletTopUp::where('token', $res->json('top_up.token'))->firstOrFail();
        $this->assertSame('app', $topUp->source);
        $this->assertSame($this->customer->id, $topUp->customer_id);

        $payment = Payment::where('wallet_topup_id', $topUp->id)->firstOrFail();
        $this->assertNull($payment->order_id);
        $this->assertNull($payment->invoice_id);
        $this->assertSame('initiated', $payment->status);
        $this->assertSame('TX-1', $payment->provider_transaction_id);
        $this->assertSame(50000, (int) $payment->amount_laar);
        $this->assertStringStartsWith('BGWAL' . $topUp->id, (string) $payment->local_id);
        // The bank brings them back to the app's Wallet panel.
        $this->assertStringContainsString('topUpId=' . $topUp->id, (string) $payment->gateway_response['return_url']);
        $this->assertStringContainsString('topUpBack=app', (string) $payment->gateway_response['return_url']);

        $this->assertSame(0, $this->balance(), 'nothing is credited until the bank confirms');
        $this->assertSame([], $this->textsTo($this->customer->phone));
    }

    public function test_the_bank_webhook_credits_the_wallet_once_and_tells_the_customer(): void
    {
        ['token' => $token, 'payment' => $payment] = $this->startFromApp(50000);

        $this->webhook($payment)->assertOk();

        $this->assertSame(50000, $this->balance());
        $topUp = WalletTopUp::where('token', $token)->firstOrFail();
        $this->assertSame('paid', $topUp->status);
        $this->assertSame($payment->id, $topUp->payment_id);
        $this->assertNotNull($topUp->paid_at);
        $ledger = CustomerDepositLedger::findOrFail($topUp->ledger_id);
        $this->assertSame('top_up', $ledger->type);
        $this->assertSame('online', $ledger->method);
        $this->assertSame(50000, $ledger->amount_laar);
        $this->assertSame($payment->id, $ledger->payment_id);
        $this->assertSame('BML TX-1', $ledger->reference);
        $this->assertSame('confirmed', $payment->fresh()->status);

        $texts = $this->textsTo($this->customer->phone);
        $this->assertSame(
            ['Bake & Grill: MVR 500.00 added to your wallet (online by card). Wallet balance: MVR 500.00. Receipt: https://bakeandgrill.mv/wallet/top-up/' . $token],
            $texts,
        );
        $this->assertSame([], $this->textsTo('7001000'), 'MVR 500 is under the owner alert amount');

        // The bank says it again, the return URL says it, the sweep asks: one credit.
        $this->webhook($payment)->assertOk();
        app(\App\Domains\Payments\Services\PaymentService::class)->confirmFromTopUpReturnUrl($topUp->id, 'TX-1');
        app(WalletTopUpService::class)->heal($topUp->fresh(), force: true);
        $this->assertSame(50000, $this->balance());
        $this->assertSame(1, CustomerDepositLedger::where('customer_id', $this->customer->id)->count());
        $this->assertCount(1, $this->textsTo($this->customer->phone));
    }

    public function test_a_large_top_up_tells_the_owners(): void
    {
        ['payment' => $payment] = $this->startFromApp(250000);
        $this->webhook($payment)->assertOk();

        $owner = $this->textsTo('7001000');
        $this->assertCount(1, $owner);
        $this->assertStringContainsString('Wallet top-up by card: MVR 2,500.00 from Wallet Customer (9607700321), from the app. Wallet balance now MVR 2,500.00.', $owner[0]);
        $this->assertDatabaseHas('sms_logs', ['type' => 'owner_deposit_large_topup']);

        // The owner moves the line on the row's "When it sends".
        SiteSetting::set(WalletTopUpRules::OWNER_ALERT, '3000');
        $this->texts = [];
        ['payment' => $second] = $this->startFromApp(250000);
        $this->webhook($second)->assertOk();
        $this->assertSame([], $this->textsTo('7001000'));
    }

    public function test_the_return_url_settles_when_the_webhook_never_came_and_goes_back_to_the_app(): void
    {
        ['token' => $token, 'payment' => $payment] = $this->startFromApp(20000);

        $res = $this->get('/payments/bml/return?topUpId=' . $payment->wallet_topup_id . '&topUpToken=' . $token . '&topUpBack=app&state=CONFIRMED&transactionId=TX-1');
        $res->assertRedirect('https://bakeandgrill.mv/order/account?topup=' . $token . '&payment=CONFIRMED');
        DeferAfterResponse::flushTestingCallbacks();

        $this->assertSame(20000, $this->balance());
        $this->assertSame('paid', WalletTopUp::where('token', $token)->value('status'));
    }

    public function test_the_app_asks_how_a_top_up_went_and_the_answer_asks_the_bank(): void
    {
        ['token' => $token] = $this->startFromApp(30000);

        // Pending, with a payment in flight: the app's question makes us ask the bank, which says paid.
        $this->asCustomer();
        $res = $this->getJson('/api/customer/wallet/top-ups/' . $token)->assertOk();
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertSame('paid', $res->json('top_up.status'));
        $this->assertEquals(300, $res->json('top_up.amount_mvr'));
        $this->assertEquals(300, $res->json('top_up.balance_after_mvr'));
        $this->assertEquals(300, $res->json('balance_mvr'));
        $this->assertSame(30000, $this->balance());

        // Another customer's top-up is nobody's business.
        $other = Customer::create(['name' => 'Other', 'phone' => '9607700555', 'is_active' => true]);
        $this->asCustomer($other);
        $this->getJson('/api/customer/wallet/top-ups/' . $token)->assertNotFound();
    }

    public function test_a_failed_payment_leaves_the_top_up_open_for_another_try(): void
    {
        ['token' => $token, 'payment' => $payment] = $this->startFromApp(10000);
        // The bank says no: nothing to ask it about any more.
        $this->bankState = 'FAILED';

        $this->webhook($payment, 'FAILED')->assertOk();
        $this->assertSame('failed', $payment->fresh()->status);
        $this->assertSame('pending', WalletTopUp::where('token', $token)->value('status'));
        $this->assertSame(0, $this->balance());

        // The app sees it pending and may start again: a new payment, a new session.
        $this->asCustomer();
        $this->getJson('/api/customer/wallet/top-ups/' . $token)->assertOk()->assertJsonPath('top_up.status', 'pending');
        $this->postJson('/api/customer/wallet/top-ups', ['amount_laar' => 10000])->assertCreated()->assertJsonPath('payment_url', 'https://bml.test/pay/2');
    }

    // ── A link from staff ─────────────────────────────────────────────

    public function test_staff_send_a_top_up_link_and_the_customer_pays_from_its_page(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);
        $res = $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/top-up-link", ['amount_mvr' => 300, 'note' => 'Asked at the counter'])->assertCreated();
        DeferAfterResponse::flushTestingCallbacks();
        $url = (string) $res->json('top_up.url');
        $token = (string) $res->json('top_up.token');
        $this->assertSame('https://bakeandgrill.mv/wallet/top-up/' . $token, $url);
        $this->assertSame('Top-up link texted to 9607700321.', $res->json('message'));
        $this->assertSame(
            ['Bake & Grill: add MVR 300.00 to your wallet by card here: ' . $url . ' The link is good for 7 days.'],
            $this->textsTo($this->customer->phone),
        );
        $this->assertDatabaseHas('sms_logs', ['customer_id' => $this->customer->id, 'type' => 'customer_wallet_topup_link']);
        $topUp = WalletTopUp::where('token', $token)->firstOrFail();
        $this->assertSame('link', $topUp->source);
        $this->assertSame($this->manager->id, $topUp->created_by_user_id);
        $this->assertSame('Asked at the counter', $topUp->note);

        // The page, signed in or not: the amount and a Pay button.
        $this->app['auth']->forgetGuards();
        $page = $this->get('/wallet/top-up/' . $token)->assertOk();
        $page->assertSee('MVR 300.00');
        $page->assertSee('data-pay-cta="wallet-topup"', false);
        $page->assertSee('Wallet Customer');
        $page->assertSee('••••••0321');
        $page->assertSee('noindex', false);

        // Pay: off to the bank, back to this page.
        $pay = $this->post('/wallet/top-up/' . $token . '/pay');
        $pay->assertRedirect('https://bml.test/pay/1');
        $payment = Payment::where('wallet_topup_id', $topUp->id)->firstOrFail();
        $this->assertSame(30000, (int) $payment->amount_laar);
        $this->assertStringContainsString('topUpBack=page', (string) $payment->gateway_response['return_url']);

        $this->texts = [];
        $back = $this->get('/payments/bml/return?topUpId=' . $topUp->id . '&topUpToken=' . $token . '&topUpBack=page&state=CONFIRMED&transactionId=TX-1');
        $back->assertRedirect(route('wallet-topup.show', ['token' => $token, 'payment' => 'CONFIRMED']));
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertSame(30000, $this->balance());
        $this->assertStringContainsString('Receipt: ' . $url, $this->textsTo($this->customer->phone)[0]);

        // The page is now the receipt.
        $receipt = $this->get('/wallet/top-up/' . $token)->assertOk();
        $receipt->assertSee('data-topup-receipt', false);
        $receipt->assertSee('Added to the wallet');
        $receipt->assertSee('Wallet balance after');
        $receipt->assertSee('TX-1');
        $receipt->assertDontSee('data-pay-cta="wallet-topup"', false);
    }

    public function test_an_open_link_lets_the_customer_pick_the_amount(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $res = $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/top-up-link")->assertCreated();
        DeferAfterResponse::flushTestingCallbacks();
        $token = (string) $res->json('top_up.token');
        $this->assertNull($res->json('top_up.amount_mvr'));
        $this->assertStringContainsString('add money to your wallet by card here:', $this->textsTo($this->customer->phone)[0]);

        $this->app['auth']->forgetGuards();
        $page = $this->get('/wallet/top-up/' . $token)->assertOk();
        $page->assertSee('How much to add');
        $page->assertSee('MVR 100');
        $page->assertSee('MVR 1,000');
        $page->assertSee('name="custom_mvr"', false);

        // A preset. The bank has not been paid yet, so the page still offers the choice, with theirs picked.
        $this->post('/wallet/top-up/' . $token . '/pay', ['amount_mvr' => '200.00'])->assertRedirect('https://bml.test/pay/1');
        $this->assertSame(20000, WalletTopUp::where('token', $token)->value('amount_laar'));
        $this->assertFalse((bool) WalletTopUp::where('token', $token)->value('amount_fixed'));
        $this->bankState = 'CREATED';
        $this->assertMatchesRegularExpression('/id="wt-preset-1"[^>]*value="200\.00"[^>]*checked/', $this->get('/wallet/top-up/' . $token)->assertOk()->getContent());

        // Changed their mind: the old session is closed, a new one opens for the new amount.
        $this->post('/wallet/top-up/' . $token . '/pay', ['amount_mvr' => '200.00', 'custom_mvr' => '350'])->assertRedirect('https://bml.test/pay/2');
        $topUp = WalletTopUp::where('token', $token)->firstOrFail();
        $this->assertSame(35000, $topUp->amount_laar);
        $this->assertSame(['cancelled', 'initiated'], Payment::where('wallet_topup_id', $topUp->id)->orderBy('id')->pluck('status')->all());

        // Too small is refused on the page too.
        $this->post('/wallet/top-up/' . $token . '/pay', ['custom_mvr' => '10'])
            ->assertRedirect(route('wallet-topup.show', $token))
            ->assertSessionHas('error', 'The smallest top-up is MVR 50.00.');
    }

    public function test_a_link_needs_the_permission_and_a_checked_number(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/top-up-link", ['amount_mvr' => 100])->assertForbidden();

        Sanctum::actingAs($this->manager, ['staff']);
        $this->customer->forceFill(['phone_unverified' => true])->save();
        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/top-up-link", ['amount_mvr' => 100])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => "This customer's number is not verified yet. Ask them to verify it in the app first."]);
        $this->customer->forceFill(['phone_unverified' => false])->save();

        // No phone: the link is made and handed back to copy; nothing is texted.
        $quiet = Customer::create(['name' => 'No Phone', 'phone' => '', 'is_active' => true]);
        $res = $this->postJson("/api/admin/customers/{$quiet->id}/deposit/top-up-link", ['amount_mvr' => 100])->assertCreated();
        $this->assertSame('Top-up link made. This customer has no phone, so copy it to them.', $res->json('message'));
        $this->assertNull($res->json('top_up.link_sent_at'));
    }

    public function test_an_expired_link_refuses_to_pay_and_the_sweep_closes_and_settles(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);
        $token = (string) $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/top-up-link", ['amount_mvr' => 100])->assertCreated()->json('top_up.token');
        $this->app['auth']->forgetGuards();

        WalletTopUp::where('token', $token)->update(['expires_at' => now()->subMinute()]);
        $page = $this->get('/wallet/top-up/' . $token)->assertOk();
        $page->assertSee('This link has expired');
        $page->assertDontSee('data-pay-cta="wallet-topup"', false);
        $this->assertSame('expired', WalletTopUp::where('token', $token)->value('status'));
        $this->post('/wallet/top-up/' . $token . '/pay')->assertRedirect(route('wallet-topup.show', $token))->assertSessionHas('error');

        // The sweep: a top-up whose payment the bank confirmed while we heard nothing is settled; a stale open one is closed.
        ['token' => $pendingToken, 'payment' => $payment] = $this->startFromApp(15000);
        Payment::whereKey($payment->id)->update(['created_at' => now()->subMinutes(10)]);
        $stale = WalletTopUp::create(['customer_id' => $this->customer->id, 'token' => WalletTopUp::newToken(), 'amount_laar' => 5000, 'status' => 'pending', 'source' => 'app', 'expires_at' => now()->subHour()]);

        $result = app(WalletTopUpService::class)->sweep();
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertSame(['checked' => 1, 'settled' => 1, 'expired' => 1], $result);
        $this->assertSame('paid', WalletTopUp::where('token', $pendingToken)->value('status'));
        $this->assertSame('expired', $stale->fresh()->status);
        $this->assertSame(15000, $this->balance());

        $this->artisan('payments:reconcile-pending-bml')->expectsOutputToContain('wallet top-up')->assertSuccessful();
    }

    public function test_the_wallet_settings_and_the_alert_row_are_wired(): void
    {
        $this->assertContains('owner_deposit_large_topup', array_keys(\App\Domains\Notifications\Support\AlertAudience::DEFAULT_GROUPS));
        $this->assertNotNull(\App\Domains\Notifications\Support\SmsTypeRegistry::get('owner_deposit_large_topup'));
        $this->assertNotNull(\App\Domains\Notifications\Support\SmsTypeRegistry::get('customer_wallet_topup_link'));
        foreach (WalletTopUpRules::KEYS as $key) {
            $this->assertContains($key, \App\Http\Controllers\Api\SiteSettingsController::WRITABLE_KEYS, $key);
        }
        $this->assertSame(1, DB::table('sms_templates')->where('slug', 'customer_wallet_topup_link')->count());
        $this->assertTrue(\App\Support\SearchVisibility::isPrivatePath('/wallet/top-up/abc'));
    }
}
