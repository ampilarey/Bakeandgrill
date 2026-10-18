<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Domains\Customers\Support\GuestNumbers;
use App\Models\Customer;
use App\Models\Order;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Guest checkout numbers nobody checked with a code (owner, 2026-10-18: "he might enter
 * someone else's number by mistake"; "admin should see the history of unverified numbers";
 * "verify your number to get rewards").
 */
class GuestNumbersTest extends TestCase
{
    use RefreshDatabase;

    private const PHONE = '+9607912345';

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('system.otp_dev_return', true);
        Mail::fake();
        SiteSetting::set('loyalty_enabled', '1');
    }

    protected function tearDown(): void
    {
        Config::set('system.otp_dev_return', false);
        parent::tearDown();
    }

    private function guest(): Customer
    {
        $this->postJson('/api/auth/customer/guest-session', ['phone' => '7912345', 'name' => 'Guest Ali'])
            ->assertOk()
            ->assertJsonPath('customer.phone_unverified', true);

        return Customer::query()->where('phone', self::PHONE)->sole();
    }

    private function completedOrder(Customer $c): Order
    {
        return Order::factory()->create([
            'customer_id' => $c->id, 'status' => 'completed', 'payment_status' => 'paid',
            'type' => 'online_pickup', 'total' => 200, 'subtotal' => 200,
        ]);
    }

    public function test_the_guest_verifying_from_their_own_session_keeps_the_history_and_collects_the_points(): void
    {
        $guest = $this->guest();
        $order = $this->completedOrder($guest);

        // While unchecked, the order earns nothing.
        app(\App\Domains\Loyalty\Services\LoyaltyLedgerService::class)->earnPointsForOrder($guest, $order);
        $this->assertSame(0, \App\Models\LoyaltyLedger::query()->where('customer_id', $guest->id)->count());

        \Laravel\Sanctum\Sanctum::actingAs($guest, ['customer']);
        $this->getJson('/api/customer/phone')->assertOk()->assertJsonPath('unverified', true)->assertJsonPath('held_orders', 1);

        $this->postJson('/api/customer/phone/send-code')->assertOk();
        // The code went by text only, never to an email the guest typed.
        Mail::assertNothingSent();

        $plain = $this->issueKnownCode(GuestNumbers::VERIFY_PURPOSE);
        $res = $this->postJson('/api/customer/phone/verify', ['code' => $plain])->assertOk()->assertJsonPath('unverified', false);

        $guest->refresh();
        $this->assertFalse($guest->phone_unverified);
        $this->assertNotNull($guest->phone_verified_at);
        $this->assertSame($guest->id, Order::query()->find($order->id)->customer_id);
        $this->assertGreaterThan(0, (int) $res->json('points_added'));
        $this->assertSame((int) $res->json('points_added'), (int) \App\Models\LoyaltyLedger::query()->where('customer_id', $guest->id)->where('type', 'earn')->sum('points'));
    }

    public function test_the_numbers_owner_signing_in_never_sees_the_guests_orders_or_address(): void
    {
        $guest = $this->guest();
        $guest->forceFill(['email' => 'guest@example.com'])->save();
        $order = $this->completedOrder($guest);
        auth('customer')->logout();
        $this->app['auth']->forgetGuards();

        // The real owner of the number signs in with a texted code from their own phone.
        $this->postJson('/api/auth/customer/otp/request', ['phone' => '7912345'])->assertOk();
        // No copy of the login code went to the email the guest typed.
        Mail::assertNothingSent();
        $plain = $this->issueKnownCode(\App\Domains\Auth\Services\CustomerOtpService::LOGIN_PURPOSES);
        $this->postJson('/api/auth/customer/otp/verify', ['phone' => '7912345', 'otp' => $plain])
            ->assertOk()
            ->assertJsonPath('is_new_customer', true)
            ->assertJsonPath('customer.phone_unverified', false);

        $owner = Customer::query()->where('phone', self::PHONE)->sole();
        $this->assertNotSame($guest->id, $owner->id);
        $this->assertNull($owner->name);
        $this->assertSame(0, Order::query()->where('customer_id', $owner->id)->count());

        $guest->refresh();
        $this->assertFalse($guest->is_active);
        $this->assertSame(self::PHONE, $guest->unverified_phone);
        $this->assertSame($owner->id, $guest->set_aside_for_customer_id);
        $this->assertSame($guest->id, Order::query()->find($order->id)->customer_id);

        // Admin sees both: the owner's card links the guest account, the filter finds it.
        $this->app['auth']->forgetGuards();
        $headers = $this->staffHeaders($this->makeOwner());
        $this->getJson('/api/admin/customers/' . $owner->id, $headers)->assertOk()->assertJsonPath('guest_accounts.0.id', $guest->id);
        $this->getJson('/api/admin/customers?phone=unverified', $headers)->assertOk()->assertJsonPath('data.0.unverified_phone', self::PHONE);
    }

    public function test_guest_checkout_can_be_switched_off(): void
    {
        SiteSetting::set(GuestNumbers::SETTING, '0');
        $this->getJson('/api/auth/customer/guest-rules')->assertOk()->assertJsonPath('guest_checkout', false);
        $this->postJson('/api/auth/customer/guest-session', ['phone' => '7912345', 'name' => 'Guest'])->assertUnprocessable();
        $this->assertSame(0, Customer::query()->count());
    }

    public function test_accounts_from_before_keep_earning_as_they_always_did(): void
    {
        $c = Customer::factory()->create();
        $this->assertFalse((bool) $c->fresh()->phone_unverified);
        $this->assertSame(0, GuestNumbers::heldOrders($c)->count());
    }

    /** Replace the newest live code of a purpose with one the test knows. */
    private function issueKnownCode(string|array $purpose): string
    {
        $row = \App\Models\OtpVerification::query()->whereIn('purpose', (array) $purpose)->whereNull('used_at')->latest('id')->first();
        $this->assertNotNull($row, 'no code was issued');
        $row->forceFill(['code_hash' => \Illuminate\Support\Facades\Hash::make('123456')])->save();

        return '123456';
    }
}
