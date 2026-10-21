<?php

declare(strict_types=1);

namespace Tests\Feature\Deposits;

use App\Domains\Deposits\Services\DepositLedgerService;
use App\Domains\Deposits\Support\DepositHolds;
use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Payments\Gateway\BmlConnectService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\CustomerDepositAccount;
use App\Models\CustomerDepositLedger;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Refund;
use App\Models\Role;
use App\Models\Shift;
use App\Models\User;
use App\Models\WalletMember;
use App\Support\DeferAfterResponse;
use App\Support\ReceiptAccountLines;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

/**
 * The family wallet (phase 4, owner 2026-10-21): a customer shares their
 * wallet with up to four others, who pay from it at the till and online
 * when their own wallet is empty. Holds and refunds follow the wallet that
 * pays, the owner hears of every payment from it, and the receipt names
 * whose wallet it was.
 */
class SharedWalletTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<array{to: string, text: string}> */
    private array $texts = [];

    private User $owner;

    private Device $device;

    private Item $item;

    /** The wallet's owner. */
    private Customer $aisha;

    /** The family member she shares it with. */
    private Customer $sister;

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
        PermissionCatalogSync::sync();

        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'owner@family.test',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->firstOrFail()->id,
            'pin_hash' => Hash::make('1234'),
            'phone' => '7001000',
            'is_active' => true,
        ]);

        $this->device = Device::create(['name' => 'Family POS', 'identifier' => 'FAMILY-POS', 'type' => 'pos', 'is_active' => true]);
        $category = Category::create(['name' => 'Family Food', 'slug' => 'family-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id, 'name' => 'Family Item', 'base_price' => 50.0, 'sku' => 'FAM-001',
            'is_active' => true, 'is_available' => true,
        ]);
        $this->aisha = Customer::create(['name' => 'Aisha Ibrahim', 'phone' => '9607700321', 'is_active' => true]);
        $this->sister = Customer::create(['name' => 'Mariyam Ibrahim', 'phone' => '9607700322', 'is_active' => true]);
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

    private function as(Customer $customer): void
    {
        Sanctum::actingAs($customer, ['customer']);
    }

    private function wallet(Customer $customer, int $laar): void
    {
        CustomerDepositAccount::create(['customer_id' => $customer->id, 'balance_laar' => $laar, 'status' => 'active']);
    }

    private function balance(Customer $customer): int
    {
        return (int) (CustomerDepositAccount::where('customer_id', $customer->id)->value('balance_laar') ?? 0);
    }

    /** Aisha shares her wallet with her sister. */
    private function share(): void
    {
        $this->as($this->aisha);
        $this->postJson('/api/customer/wallet/members', ['phone' => '7700322'])->assertOk();
        DeferAfterResponse::flushTestingCallbacks();
        $this->texts = [];
    }

    private function newCustomer(string $name, string $last7): Customer
    {
        return Customer::create(['name' => $name, 'phone' => '960' . $last7, 'is_active' => true]);
    }

    /** An online pickup order waiting for payment, worth $laar. */
    private function onlineOrder(Customer $customer, int $laar): Order
    {
        $order = Order::factory()->create([
            'customer_id' => $customer->id, 'type' => 'online_pickup', 'status' => 'payment_pending',
            'order_number' => 'BG-FAM-' . strtoupper(Str::random(6)),
            'payment_status' => 'unpaid', 'total' => $laar / 100, 'total_laar' => $laar, 'subtotal' => $laar / 100, 'tax_amount' => 0,
        ]);
        Payment::query()->where('order_id', $order->id)->delete();

        return $order;
    }

    private function cardPaymentFor(Order $order): Payment
    {
        return Payment::query()->where('order_id', $order->id)->where('method', 'bml_connect')->latest('id')->firstOrFail();
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

    /** A sale of one item at the till for $customer, paid with $method in full. */
    private function tillSale(Customer $customer, string $method): Order
    {
        Sanctum::actingAs($this->owner, ['staff']);
        if (Shift::where('user_id', $this->owner->id)->whereNull('closed_at')->doesntExist()) {
            $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();
        }
        $response = $this->withHeader('X-Device-Identifier', $this->device->identifier)->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'customer_id' => $customer->id,
            'items' => [['item_id' => $this->item->id, 'name' => $this->item->name, 'quantity' => 1]],
        ]);
        $response->assertCreated();
        $order = Order::findOrFail((int) $response->json('order.id'));
        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$order->id}/payments", [
                'payments' => [['method' => $method, 'amount' => self::totalLaar($order) / 100]],
                'print_receipt' => false,
            ])
            ->assertOk();
        DeferAfterResponse::flushTestingCallbacks();

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

    // ── Sharing ───────────────────────────────────────────────────────

    public function test_a_customer_shares_their_wallet_by_phone_and_the_member_is_told(): void
    {
        $this->wallet($this->aisha, 10000);
        $this->as($this->aisha);

        $this->postJson('/api/customer/wallet/members', ['phone' => '7700322'])->assertOk()
            ->assertJsonPath('members.0.id', $this->sister->id)
            ->assertJsonPath('members.0.name', 'Mariyam Ibrahim')
            ->assertJsonPath('members.0.phone', '•••0322')
            ->assertJsonPath('max', 4)
            ->assertJsonPath('shares_wallet_of', null);
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertDatabaseHas('wallet_members', ['owner_customer_id' => $this->aisha->id, 'member_customer_id' => $this->sister->id]);
        $told = $this->textsTo('9607700322');
        $this->assertCount(1, $told);
        $this->assertStringContainsString('Aisha Ibrahim shares their wallet with you', $told[0]);
        $this->assertSame([], $this->textsTo('9607700321'), 'the owner asked for it; no text to them');

        // The member sees whose wallet they may spend, and the owner who spends theirs.
        $this->as($this->sister);
        $this->getJson('/api/customer/wallet/members')->assertOk()
            ->assertJsonPath('members', [])
            ->assertJsonPath('shares_wallet_of.name', 'Aisha')
            ->assertJsonPath('shares_wallet_of.balance_mvr', 100)
            ->assertJsonPath('shares_wallet_of.active', true);
        $this->getJson('/api/customer/deposit')->assertOk()
            ->assertJsonPath('deposit.balance_mvr', 100)
            ->assertJsonPath('deposit.available_mvr', 100)
            ->assertJsonPath('deposit.shared_from', 'Aisha')
            ->assertJsonPath('deposit.shares_wallet_of', 'Aisha')
            ->assertJsonPath('deposit.shared_with', []);
        $this->as($this->aisha);
        $this->getJson('/api/customer/deposit')->assertOk()
            ->assertJsonPath('deposit.shared_from', null)
            ->assertJsonPath('deposit.shares_wallet_of', null)
            ->assertJsonPath('deposit.shared_with.0.id', $this->sister->id)
            ->assertJsonPath('deposit.shared_with.0.name', 'Mariyam Ibrahim');
    }

    public function test_the_rules_of_sharing(): void
    {
        $this->wallet($this->aisha, 10000);
        $this->as($this->aisha);
        $members = '/api/customer/wallet/members';

        $this->postJson($members, ['phone' => '7700321'])->assertUnprocessable()->assertJsonPath('message', 'That is your own number.');
        $this->postJson($members, ['phone' => '7700999'])->assertUnprocessable();
        $this->postJson($members, ['phone' => '12'])->assertUnprocessable();
        // A guest number nobody checked (GuestNumbers) cannot be given a wallet.
        $guest = $this->newCustomer('Guest', '7700333');
        $guest->forceFill(['phone_unverified' => true])->save();
        $this->postJson($members, ['phone' => '7700333'])->assertUnprocessable();

        $this->postJson($members, ['phone' => '7700322'])->assertOk();
        $this->postJson($members, ['phone' => '7700322'])->assertUnprocessable()->assertJsonPath('message', 'They already share your wallet.');

        // A member cannot share a wallet of their own, nor join a second one,
        // and an owner cannot join anyone's.
        $third = $this->newCustomer('Third', '7700344');
        $this->as($this->sister);
        $this->postJson($members, ['phone' => '7700344'])->assertUnprocessable();
        $this->as($third);
        $this->postJson($members, ['phone' => '7700322'])->assertUnprocessable();
        $this->postJson($members, ['phone' => '7700321'])->assertUnprocessable();

        // Four at most.
        $this->as($this->aisha);
        foreach (['7700345', '7700346', '7700347'] as $n) {
            $this->newCustomer('Member ' . $n, $n);
            $this->postJson($members, ['phone' => $n])->assertOk();
        }
        $this->newCustomer('Fifth', '7700348');
        $this->postJson($members, ['phone' => '7700348'])->assertUnprocessable()
            ->assertJsonPath('message', 'A wallet can be shared with 4 people at most.');
        $this->assertSame(4, WalletMember::where('owner_customer_id', $this->aisha->id)->count());
    }

    public function test_the_owner_takes_a_member_off_and_a_member_can_leave(): void
    {
        $this->wallet($this->aisha, 10000);
        $this->share();

        $this->as($this->aisha);
        $this->deleteJson('/api/customer/wallet/members/999999')->assertNotFound();
        $this->deleteJson("/api/customer/wallet/members/{$this->sister->id}")->assertOk()->assertJsonPath('members', []);
        $this->as($this->sister);
        $this->getJson('/api/customer/deposit')->assertOk()->assertJsonPath('deposit', null);
        $order = $this->onlineOrder($this->sister, 1000);
        $this->postJson("/api/customer/orders/{$order->id}/pay-wallet")->assertUnprocessable();

        // Shared again; this time the member leaves.
        $this->share();
        $this->as($this->sister);
        $this->getJson('/api/customer/deposit')->assertOk()->assertJsonPath('deposit.shared_from', 'Aisha');
        $this->deleteJson('/api/customer/wallet/members/leave')->assertOk()->assertJsonPath('shares_wallet_of', null);
        $this->assertSame(0, WalletMember::count());
        $this->postJson("/api/customer/orders/{$order->id}/pay-wallet")->assertUnprocessable();
    }

    // ── Spending ──────────────────────────────────────────────────────

    public function test_a_member_pays_an_online_order_from_the_shared_wallet_and_the_owner_is_told(): void
    {
        $this->wallet($this->aisha, 10000);
        $this->share();
        $order = $this->onlineOrder($this->sister, 3000);

        $this->as($this->sister);
        $this->postJson("/api/customer/orders/{$order->id}/pay-wallet")->assertOk()->assertJsonPath('balance_laar', 7000);
        DeferAfterResponse::flushTestingCallbacks();

        $this->assertSame(7000, $this->balance($this->aisha));
        $this->assertFalse(CustomerDepositAccount::where('customer_id', $this->sister->id)->exists(), 'no wallet is made for the member');
        $this->assertSame('paid', $order->fresh()->payment_status);
        $row = CustomerDepositLedger::where('order_id', $order->id)->where('type', 'usage')->firstOrFail();
        $this->assertSame($this->aisha->id, (int) $row->customer_id);
        $this->assertSame($this->sister->id, (int) $row->spent_by_customer_id);
        $this->assertSame(-3000, (int) $row->amount_laar);

        // The owner is told once; the member's own texts are the order's.
        $ownerTexts = $this->textsTo('9607700321');
        $this->assertCount(1, $ownerTexts);
        $this->assertStringContainsString('MVR 30.00 paid from your wallet by Mariyam Ibrahim for #' . $order->order_number . '. Wallet balance: MVR 70.00', $ownerTexts[0]);
        $memberTexts = implode("\n", $this->textsTo('9607700322'));
        $this->assertStringNotContainsString('paid from your wallet by', $memberTexts);
        $this->assertStringContainsString("MVR 30.00 from Aisha's wallet, balance MVR 70.00", $memberTexts, 'the confirmation names whose wallet paid');
        $lines = ReceiptAccountLines::for($order->fresh());
        $this->assertSame('Aisha', $lines['wallet']['shared_from']);
        $this->assertSame(7000, $lines['wallet']['balance_laar']);

        // Each sees the payment in their wallet activity.
        $labels = collect($this->getJson('/api/customer/deposit/ledger')->assertOk()->json('transactions'))->pluck('label')->all();
        $this->assertContains('Order payment (shared wallet)', $labels);
        $this->as($this->aisha);
        $labels = collect($this->getJson('/api/customer/deposit/ledger')->assertOk()->json('transactions'))->pluck('label')->all();
        $this->assertContains('Order payment · by Mariyam Ibrahim', $labels);
    }

    public function test_a_members_own_money_goes_first(): void
    {
        $this->wallet($this->aisha, 10000);
        $this->wallet($this->sister, 5000);
        $this->share();

        $this->as($this->sister);
        $this->getJson('/api/customer/deposit')->assertOk()
            ->assertJsonPath('deposit.balance_mvr', 50)
            ->assertJsonPath('deposit.shared_from', null)
            ->assertJsonPath('deposit.shares_wallet_of', 'Aisha');
        $order = $this->onlineOrder($this->sister, 3000);
        $this->postJson("/api/customer/orders/{$order->id}/pay-wallet")->assertOk()->assertJsonPath('balance_laar', 2000);
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertSame(2000, $this->balance($this->sister));
        $this->assertSame(10000, $this->balance($this->aisha));
        $this->assertSame([], $this->textsTo('9607700321'));

        // With MVR 20 of their own, a MVR 30 order is their own wallet and the
        // card; once their own is empty, the shared wallet pays.
        $second = $this->onlineOrder($this->sister, 3000);
        $this->postJson("/api/customer/orders/{$second->id}/pay-wallet")->assertUnprocessable();
        $this->postJson("/api/customer/orders/{$second->id}/hold-wallet")->assertOk()
            ->assertJsonPath('held_laar', 2000)->assertJsonPath('remaining_laar', 1000);
        $this->deleteJson("/api/customer/orders/{$second->id}/hold-wallet")->assertOk();
        $third = $this->onlineOrder($this->sister, 2000);
        $this->postJson("/api/customer/orders/{$third->id}/pay-wallet")->assertOk()
            ->assertJsonPath('balance_laar', 10000, 'what they can spend now is the shared wallet');
        $this->postJson("/api/customer/orders/{$second->id}/pay-wallet")->assertOk()->assertJsonPath('balance_laar', 7000);
        $this->assertSame(0, $this->balance($this->sister));
        $this->assertSame(7000, $this->balance($this->aisha));
    }

    public function test_a_members_hold_counts_against_the_shared_wallet_until_the_card_pays(): void
    {
        $this->wallet($this->aisha, 10000);
        $this->share();
        $order = $this->onlineOrder($this->sister, 12000);

        $this->as($this->sister);
        $this->postJson("/api/customer/orders/{$order->id}/hold-wallet")->assertOk()
            ->assertJsonPath('held_laar', 10000)->assertJsonPath('remaining_laar', 2000);
        $this->assertSame(10000, $this->balance($this->aisha), 'nothing leaves the wallet on a hold');

        // Nothing is left for the owner meanwhile, online or at the till.
        $this->as($this->aisha);
        $this->getJson('/api/customer/deposit')->assertOk()
            ->assertJsonPath('deposit.held_mvr', 100)->assertJsonPath('deposit.available_mvr', 0);
        $own = $this->onlineOrder($this->aisha, 1000);
        $this->postJson("/api/customer/orders/{$own->id}/pay-wallet")->assertUnprocessable();
        Sanctum::actingAs($this->owner, ['staff']);
        $this->getJson("/api/customers/{$this->aisha->id}/pos-summary")->assertOk()
            ->assertJsonPath('deposit.held_laar', 10000)->assertJsonPath('deposit.available_laar', 0);
        $this->getJson("/api/customers/{$this->sister->id}/pos-summary")->assertOk()
            ->assertJsonPath('deposit.shared_from', 'Aisha')->assertJsonPath('deposit.available_laar', 0);

        // The card pays the rest and the held money leaves the shared wallet.
        $this->as($this->sister);
        $this->postJson("/api/orders/{$order->id}/pay/bml")->assertOk();
        $card = $this->cardPaymentFor($order);
        $this->assertSame(2000, (int) $card->amount_laar);
        $this->webhook($card);
        $this->assertSame('paid', $order->fresh()->payment_status);
        $this->assertSame(0, $this->balance($this->aisha));
        $hold = Payment::where('order_id', $order->id)->where('method', DepositHolds::METHOD)->firstOrFail();
        $this->assertSame('paid', $hold->status);
        $row = CustomerDepositLedger::where('payment_id', $hold->id)->where('type', 'usage')->firstOrFail();
        $this->assertSame($this->aisha->id, (int) $row->customer_id);
        $this->assertSame($this->sister->id, (int) $row->spent_by_customer_id);
        $this->assertStringContainsString('MVR 100.00 paid from your wallet by Mariyam Ibrahim', implode("\n", $this->textsTo('9607700321')));
    }

    public function test_a_till_sale_by_a_member_draws_on_the_shared_wallet(): void
    {
        $this->wallet($this->aisha, 10000);
        $this->share();

        // The till sees what they can spend and whose it is.
        Sanctum::actingAs($this->owner, ['staff']);
        $this->getJson("/api/customers/{$this->sister->id}/pos-summary")->assertOk()
            ->assertJsonPath('deposit.has_account', true)
            ->assertJsonPath('deposit.balance_laar', 10000)
            ->assertJsonPath('deposit.can_use', true)
            ->assertJsonPath('deposit.shared_from', 'Aisha');

        $order = $this->tillSale($this->sister, 'wallet');
        $total = self::totalLaar($order);
        $this->assertSame('paid', $order->payment_status);
        $this->assertSame(10000 - $total, $this->balance($this->aisha));
        $this->assertFalse(CustomerDepositAccount::where('customer_id', $this->sister->id)->exists());
        $row = CustomerDepositLedger::where('order_id', $order->id)->where('type', 'usage')->firstOrFail();
        $this->assertSame($this->aisha->id, (int) $row->customer_id);
        $this->assertSame($this->sister->id, (int) $row->spent_by_customer_id);
        $this->assertStringContainsString('MVR ' . self::mvr($total) . ' paid from your wallet by Mariyam Ibrahim for #' . $order->order_number, implode("\n", $this->textsTo('9607700321')));

        // Admin shows the family on both cards: the owner's own wallet with who
        // shares it, the member's own (empty) with whose they may spend.
        $this->getJson("/api/admin/customers/{$this->aisha->id}/deposit")->assertOk()
            ->assertJsonPath('deposit.balance_laar', 10000 - $total)
            ->assertJsonPath('deposit.shared_with.0.id', $this->sister->id)
            ->assertJsonPath('deposit.shares_wallet_of', null);
        $this->getJson("/api/admin/customers/{$this->sister->id}/deposit")->assertOk()
            ->assertJsonPath('deposit.balance_laar', 0)
            ->assertJsonPath('deposit.shares_wallet_of', 'Aisha')
            ->assertJsonPath('deposit.shared_with', []);
    }

    public function test_a_refund_of_a_members_order_goes_back_to_the_wallet_that_paid(): void
    {
        $this->wallet($this->aisha, 10000);
        $this->share();
        $order = $this->tillSale($this->sister, 'wallet');
        $total = self::totalLaar($order);
        $this->assertSame(10000 - $total, $this->balance($this->aisha));

        $refund = Refund::create([
            'order_id' => $order->id,
            'amount' => $total / 100,
            'status' => 'approved',
            'reason' => 'Test',
            'requested_at' => now(),
        ]);
        app(DepositLedgerService::class)->reverseUsageForOrderRefund($order->fresh(), $total, $refund, $this->owner);

        $this->assertSame(10000, $this->balance($this->aisha));
        $this->assertFalse(CustomerDepositAccount::where('customer_id', $this->sister->id)->exists(), 'the member gets no wallet of their own out of it');
        $this->assertDatabaseHas('customer_deposit_ledger', ['customer_id' => $this->aisha->id, 'type' => 'reversal', 'refund_id' => $refund->id, 'amount_laar' => $total]);
    }
}
