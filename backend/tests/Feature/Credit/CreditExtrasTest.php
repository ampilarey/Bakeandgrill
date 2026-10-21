<?php

declare(strict_types=1);

namespace Tests\Feature\Credit;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Payments\Gateway\BmlConnectService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\CashMovement;
use App\Models\Category;
use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\CustomerDepositAccount;
use App\Models\CustomerDepositLedger;
use App\Models\Device;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Role;
use App\Models\Shift;
use App\Models\SiteSetting;
use App\Models\User;
use App\Models\WalletTopUp;
use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

/**
 * Phase 4 of the deposit plan (owner, 2026-10-21): the four saved till
 * items (a repayment larger than the balance goes to the wallet, cash the
 * owner holds away from the till), the account settled from the wallet
 * every night, a bonus on top-ups, and an online order on the account.
 */
class CreditExtrasTest extends TestCase
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

    private int $bankCalls = 0;

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

        $bml = Mockery::mock(BmlConnectService::class);
        $bml->shouldReceive('normalizeLocalId')->andReturnUsing(fn (string $id) => substr(preg_replace('/[^A-Za-z0-9]/', '', $id), 0, 50));
        $bml->shouldReceive('createPayment')->andReturnUsing(function (int $amountLaar, string $localId) {
            $this->bankCalls++;

            return ['payment_url' => 'https://bml.test/pay/' . $this->bankCalls, 'transaction_id' => 'TX-' . $this->bankCalls, 'local_id' => $localId];
        });
        $bml->shouldReceive('getTransactionStatus')->andReturnUsing(fn (string $tx) => ['state' => 'CONFIRMED', 'transactionId' => $tx]);
        $bml->shouldReceive('verifyWebhookSignature')->andReturn(true);
        $this->app->instance(BmlConnectService::class, $bml);

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
        $this->owner = $make('owner', 'owner@extras.test', '7001000');
        $this->manager = $make('manager', 'manager@extras.test', null);
        $this->staff = $make('staff', 'staff@extras.test', null);

        $this->device = Device::create(['name' => 'Extras POS', 'identifier' => 'EXTRAS-POS', 'type' => 'pos', 'is_active' => true]);
        $category = Category::create(['name' => 'Extras Food', 'slug' => 'extras-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id, 'name' => 'Extras Item', 'base_price' => 50.0, 'sku' => 'EXT-001',
            'is_active' => true, 'is_available' => true,
        ]);
        $this->customer = Customer::create(['name' => 'Extras Customer', 'phone' => '9607700123', 'is_active' => true]);
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

    /** A sale of one item on the customer's credit account at the till. */
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
        $this->texts = [];

        return $order->fresh();
    }

    private static function totalLaar(Order $order): int
    {
        return (int) ($order->total_laar ?? round((float) $order->total * 100));
    }

    private static function mvr(int $laar): string
    {
        return number_format($laar / 100, 2, '.', ',');
    }

    private function walletBalance(): int
    {
        return (int) (CustomerDepositAccount::where('customer_id', $this->customer->id)->value('balance_laar') ?? 0);
    }

    private function owed(): int
    {
        return (int) $this->customer->fresh()->credit_balance_laar;
    }

    private function onlineOrder(int $laar): Order
    {
        $order = Order::factory()->create([
            'order_number' => 'BG-ONL-' . strtoupper(\Illuminate\Support\Str::random(6)),
            'customer_id' => $this->customer->id, 'type' => 'online_pickup', 'status' => 'payment_pending',
            'payment_status' => 'unpaid', 'total' => $laar / 100, 'total_laar' => $laar, 'subtotal' => $laar / 100, 'tax_amount' => 0,
        ]);
        Payment::query()->where('order_id', $order->id)->delete();
        \App\Models\OrderItem::create([
            'order_id' => $order->id, 'item_id' => $this->item->id, 'item_name' => $this->item->name,
            'quantity' => 1, 'unit_price' => $laar / 100, 'total_price' => $laar / 100,
        ]);

        return $order;
    }

    private function webhook(Payment $payment, string $state = 'CONFIRMED'): void
    {
        $body = json_encode([
            'transactionId' => $payment->provider_transaction_id,
            'localId' => $payment->local_id,
            'state' => $state,
            'amount' => (int) $payment->amount_laar,
            'currency' => 'MVR',
        ]);
        $this->call('POST', '/api/payments/bml/webhook', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X-BML-Signature' => 'ok'], $body)->assertOk();
        DeferAfterResponse::flushTestingCallbacks();
    }

    // ── Cash the owner holds away from the till ───────────────────────

    public function test_only_the_owner_records_cash_held_away_from_the_till_and_no_drawer_moves(): void
    {
        $this->approve(50000);
        $order = $this->creditSale();
        $sale = self::totalLaar($order);

        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/admin/customers/{$this->customer->id}/credit/repayments", ['amount_laar' => 1000, 'method' => 'owner_cash'])
            ->assertUnprocessable();

        Sanctum::actingAs($this->owner, ['staff']);
        $this->assertTrue(Shift::where('user_id', $this->owner->id)->whereNull('closed_at')->doesntExist(), 'the owner has no shift open');
        $this->postJson("/api/admin/customers/{$this->customer->id}/credit/repayments", ['amount_laar' => 1000, 'method' => 'owner_cash', 'reference' => 'Handed over at the market'])
            ->assertCreated()->assertJsonPath('ledger.method', 'owner_cash');
        DeferAfterResponse::flushTestingCallbacks();

        $this->assertSame($sale - 1000, $this->owed());
        $this->assertSame(0, CashMovement::query()->count(), 'nothing in any drawer');
        $this->assertNull(CustomerCreditLedger::where('customer_id', $this->customer->id)->where('type', 'payment')->value('shift_id'));
        $texts = $this->textsTo($this->customer->phone);
        $this->assertCount(1, $texts);
        $this->assertStringContainsString('MVR 10.00 received (cash)', $texts[0]);
    }

    // ── More than is owed goes into the wallet ────────────────────────

    public function test_a_repayment_larger_than_the_balance_puts_the_rest_in_the_wallet_when_asked(): void
    {
        $this->approve(50000);
        $order = $this->creditSale();
        $sale = self::totalLaar($order);
        $this->openShift($this->owner);

        // Without the flag, refused as before.
        $this->postJson("/api/admin/customers/{$this->customer->id}/credit/repayments", ['amount_laar' => $sale + 2600, 'method' => 'cash'])
            ->assertUnprocessable();
        $this->assertSame($sale, $this->owed());

        $this->postJson("/api/admin/customers/{$this->customer->id}/credit/repayments", ['amount_laar' => $sale + 2600, 'method' => 'cash', 'surplus_to_wallet' => true])
            ->assertCreated()->assertJsonPath('surplus_to_wallet_laar', 2600)->assertJsonPath('ledger.amount_laar', -$sale);
        DeferAfterResponse::flushTestingCallbacks();

        $this->assertSame(0, $this->owed());
        $this->assertSame(2600, $this->walletBalance());
        $this->assertDatabaseHas('customer_deposit_ledger', ['customer_id' => $this->customer->id, 'type' => 'top_up', 'method' => 'cash', 'amount_laar' => 2600]);
        // The drawer took the whole handful: the repayment's movement and the wallet's.
        $this->assertSame($sale + 2600, (int) round((float) CashMovement::query()->where('type', 'cash_in')->sum('amount') * 100));

        $texts = $this->textsTo($this->customer->phone);
        $this->assertCount(1, $texts, 'one handful of cash, one text');
        $this->assertStringContainsString('Your credit account is fully paid.', $texts[0]);
        $this->assertStringContainsString('MVR 26.00 extra is in your wallet.', $texts[0]);
    }

    // ── Settled from the wallet every night ───────────────────────────

    public function test_the_account_is_settled_from_the_wallet_nightly_when_the_customer_or_staff_asked(): void
    {
        $this->approve(50000);
        $order = $this->creditSale();
        $sale = self::totalLaar($order);
        CustomerDepositAccount::create(['customer_id' => $this->customer->id, 'balance_laar' => 3000, 'status' => 'active']);

        // Off: the nightly run leaves it alone.
        $this->artisan('credit:settle-from-wallet')->assertSuccessful();
        $this->assertSame($sale, $this->owed());

        // The customer switches it on from the app; Admin sees it.
        $this->asCustomer();
        $this->getJson('/api/customer/credit')->assertOk()->assertJsonPath('credit.settle_from_wallet', false);
        $this->patchJson('/api/customer/credit/preferences', ['credit_settle_from_wallet' => true])->assertOk()
            ->assertJsonPath('credit.settle_from_wallet', true)->assertJsonPath('credit.reminder_sms_enabled', true);
        Sanctum::actingAs($this->manager, ['staff']);
        $this->getJson("/api/admin/customers/{$this->customer->id}/credit")->assertOk()->assertJsonPath('credit.settle_from_wallet', true);

        // Money on hold for an unpaid online order is not touched.
        $pending = $this->onlineOrder(12000);
        \App\Domains\Deposits\Support\DepositHolds::hold($this->customer, $pending, 1000);

        $this->texts = [];
        $this->artisan('credit:settle-from-wallet')->assertSuccessful();
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertSame($sale - 2000, $this->owed(), 'the free MVR 20 went to the account');
        $this->assertSame(1000, $this->walletBalance(), 'the held MVR 10 stayed');
        $this->assertDatabaseHas('customer_deposit_ledger', ['customer_id' => $this->customer->id, 'type' => 'transfer_to_credit', 'amount_laar' => -2000]);
        $texts = $this->textsTo($this->customer->phone);
        $this->assertCount(1, $texts);
        $this->assertStringContainsString('MVR 20.00 received (from your wallet)', $texts[0]);

        // Staff switch it off; the next night nothing moves.
        $this->patchJson("/api/admin/customers/{$this->customer->id}/credit", ['action' => 'set_settle_from_wallet', 'credit_settle_from_wallet' => false])
            ->assertOk()->assertJsonPath('customer.settle_from_wallet', false);
        \App\Domains\Deposits\Support\DepositHolds::release($pending);
        $this->artisan('credit:settle-from-wallet')->assertSuccessful();
        $this->assertSame($sale - 2000, $this->owed());
    }

    // ── A bonus on top-ups ────────────────────────────────────────────

    public function test_a_top_up_at_or_above_the_minimum_earns_the_bonus_as_a_row_of_its_own(): void
    {
        SiteSetting::set('wallet_topup_bonus_percent', '5');
        SiteSetting::set('wallet_topup_bonus_min_mvr', '500');
        $this->openShift($this->manager);

        // Below the minimum: nothing extra.
        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/top-up", ['amount_laar' => 40000, 'method' => 'cash'])->assertCreated();
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertSame(40000, $this->walletBalance());
        $this->assertSame(0, CustomerDepositLedger::where('customer_id', $this->customer->id)->where('type', 'bonus')->count());

        // At the counter, at the minimum: 5% extra, one text that says so.
        $this->texts = [];
        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/top-up", ['amount_laar' => 50000, 'method' => 'cash'])->assertCreated();
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertSame(40000 + 50000 + 2500, $this->walletBalance());
        $bonus = CustomerDepositLedger::where('customer_id', $this->customer->id)->where('type', 'bonus')->firstOrFail();
        $this->assertSame(2500, (int) $bonus->amount_laar);
        $this->assertSame('bonus', $bonus->method);
        $this->assertStringContainsString('5% bonus on a top-up of MVR 500.00', (string) $bonus->notes);
        $this->assertSame(50000, (int) round((float) CashMovement::query()->where('type', 'cash_in')->latest('id')->value('amount') * 100), 'the drawer took the top-up, not the bonus');
        $texts = $this->textsTo($this->customer->phone);
        $this->assertCount(1, $texts);
        $this->assertStringContainsString('MVR 500.00 added to your wallet (cash). Wallet balance: MVR 925.00. Plus a MVR 25.00 bonus.', $texts[0]);

        // By card from the app: the rules say what it earns, and the bonus lands with the money.
        $this->asCustomer();
        $this->getJson('/api/customer/wallet/top-ups/rules')->assertOk()
            ->assertJsonPath('rules.bonus_percent', 5)->assertJsonPath('rules.bonus_min_mvr', 500);
        $token = (string) $this->postJson('/api/customer/wallet/top-ups', ['amount_laar' => 100000])->assertCreated()->json('top_up.token');
        $payment = Payment::where('wallet_topup_id', WalletTopUp::where('token', $token)->value('id'))->firstOrFail();
        $this->texts = [];
        $this->webhook($payment);
        $this->assertSame(92500 + 100000 + 5000, $this->walletBalance());
        $this->assertStringContainsString('Plus a MVR 50.00 bonus.', $this->textsTo($this->customer->phone)[0]);

        // The customer's wallet activity names it.
        $labels = collect($this->getJson('/api/customer/deposit/ledger')->assertOk()->json('transactions'))->pluck('label')->all();
        $this->assertContains('Bonus added', $labels);

        // Off again: no bonus.
        SiteSetting::set('wallet_topup_bonus_percent', '0');
        $this->openShift($this->manager);
        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/top-up", ['amount_laar' => 50000, 'method' => 'cash'])->assertCreated();
        $this->assertSame(197500 + 50000, $this->walletBalance());
    }

    public function test_money_that_only_moves_pots_earns_no_bonus(): void
    {
        SiteSetting::set('wallet_topup_bonus_percent', '10');
        $this->approve(50000);
        $order = $this->creditSale();
        $sale = self::totalLaar($order);

        // A credit repayment larger than the balance: the extra is not a top-up.
        $this->openShift($this->owner);
        $this->postJson("/api/admin/customers/{$this->customer->id}/credit/repayments", ['amount_laar' => $sale + 1000, 'method' => 'cash', 'surplus_to_wallet' => true])->assertCreated();
        $this->assertSame(1000, $this->walletBalance());
        $this->assertSame(0, CustomerDepositLedger::where('customer_id', $this->customer->id)->where('type', 'bonus')->count());
    }

    // ── An online order on the account ────────────────────────────────

    public function test_an_online_order_goes_on_the_credit_account_like_a_till_sale(): void
    {
        $this->approve(50000);
        $this->asCustomer();
        $this->getJson('/api/customer/credit')->assertOk()->assertJsonPath('credit.online_orders', true);

        $order = $this->onlineOrder(12000);
        // A wallet hold from an earlier tap goes.
        CustomerDepositAccount::create(['customer_id' => $this->customer->id, 'balance_laar' => 5000, 'status' => 'active']);
        $this->postJson("/api/customer/orders/{$order->id}/hold-wallet")->assertOk();

        $this->texts = [];
        $this->postJson("/api/customer/orders/{$order->id}/pay-credit")->assertOk()
            ->assertJsonPath('order.payment_status', 'paid')->assertJsonPath('credit.balance_mvr', 120);
        DeferAfterResponse::flushTestingCallbacks();

        $order->refresh();
        $this->assertSame('paid', $order->payment_status);
        $this->assertNotContains($order->status, ['payment_pending', 'cancelled']);
        $this->assertSame(12000, $this->owed());
        $this->assertSame('cancelled', Payment::where('order_id', $order->id)->where('method', 'customer_deposit')->value('status'));
        $this->assertSame(5000, $this->walletBalance(), 'the wallet was left alone');
        $payment = Payment::where('order_id', $order->id)->where('method', 'house_account')->firstOrFail();
        $this->assertSame('paid', $payment->status);
        $invoice = Invoice::where('order_id', $order->id)->where('type', 'sale')->firstOrFail();
        $this->assertSame(12000, $invoice->balanceDueLaar());
        $this->assertNotNull($invoice->due_date);
        $texts = $this->textsTo($this->customer->phone);
        $this->assertNotEmpty($texts);
        $this->assertStringContainsString('MVR 120.00 charged to your credit account for #' . $order->order_number, implode("\n", $texts));
        $this->assertCount(1, array_filter($texts, fn (string $t) => str_contains($t, 'charged to your credit account')), 'one charge, one text');

        // A second tap changes nothing.
        $this->postJson("/api/customer/orders/{$order->id}/pay-credit")->assertUnprocessable();
        $this->assertSame(12000, $this->owed());
    }

    public function test_an_online_order_on_account_is_refused_over_the_limit_or_when_the_owner_turned_it_off(): void
    {
        $this->approve(10000);
        $this->asCustomer();
        $big = $this->onlineOrder(12000);
        $this->postJson("/api/customer/orders/{$big->id}/pay-credit")->assertUnprocessable();
        $this->assertSame(0, $this->owed());
        $this->assertSame('payment_pending', $big->fresh()->status);

        SiteSetting::set('credit_online_orders_enabled', '0');
        $this->getJson('/api/customer/credit')->assertOk()->assertJsonPath('credit.online_orders', false);
        $small = $this->onlineOrder(5000);
        $this->postJson("/api/customer/orders/{$small->id}/pay-credit")->assertUnprocessable();
        $this->assertSame(0, $this->owed());

        // No credit account at all: nothing to charge to.
        $stranger = Customer::create(['name' => 'No Credit', 'phone' => '9607700999', 'is_active' => true]);
        $theirs = Order::factory()->create(['customer_id' => $stranger->id, 'status' => 'payment_pending']);
        Sanctum::actingAs($stranger, ['customer']);
        SiteSetting::set('credit_online_orders_enabled', '1');
        $this->postJson("/api/customer/orders/{$theirs->id}/pay-credit")->assertUnprocessable();
        // Not their order.
        $this->postJson("/api/customer/orders/{$small->id}/pay-credit")->assertForbidden();
    }
}
