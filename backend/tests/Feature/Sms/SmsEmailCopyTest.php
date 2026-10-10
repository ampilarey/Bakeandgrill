<?php

declare(strict_types=1);

namespace Tests\Feature\Sms;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\SmsDeliveryRules;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Mail\SmsCopyMail;
use App\Models\Customer;
use App\Models\User;
use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use Mockery;
use Tests\TestCase;

/**
 * Owner, 2026-10-06: "All. And not customers only. Admin and all staffs too
 * receive email in all the scenarios." Every text that passes the SMS rules
 * also goes by email to the person's saved address.
 */
class SmsEmailCopyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $provider = Mockery::mock(SmsProviderInterface::class);
        $provider->shouldReceive('send')->andReturn([true, ['ok' => true], null]);
        $this->app->instance(SmsProviderInterface::class, $provider);
        Mail::fake();
    }

    private function text(string $to, string $message, string $type, ?int $customerId = null, ?string $key = null): void
    {
        app(SmsService::class)->send(new SmsMessage(
            to: $to, message: $message, type: $type, customerId: $customerId, idempotencyKey: $key,
        ));
        DeferAfterResponse::flushTestingCallbacks();
    }

    private function customer(array $attrs = []): Customer
    {
        return Customer::create(array_merge([
            'phone' => '+9607771234', 'name' => 'Aishath Ali', 'email' => 'aishath@example.com',
            'loyalty_points' => 0, 'tier' => 'bronze',
        ], $attrs));
    }

    public function test_a_customer_text_is_copied_to_the_customer_email_with_its_link_as_a_button(): void
    {
        $c = $this->customer();
        $this->text('7771234', 'Your order #A12 is ready to collect. Track: https://bakeandgrill.mv/order/orders/12', 'customer_order_ready', $c->id);

        Mail::assertSent(SmsCopyMail::class, function (SmsCopyMail $m) {
            $html = $m->render();

            return $m->hasTo('aishath@example.com')
                && $m->subject === 'Your order #A12 is ready to collect'
                && str_contains($html, 'Hi Aishath,')
                && str_contains($html, '>Track your order</a>')
                && str_contains($html, 'A copy of the text we sent to +960 777 ••34')
                && $m->unsubscribeUrl() === null;
        });
    }

    public function test_a_staff_alert_goes_to_the_staff_account_email(): void
    {
        $owner = User::factory()->create(['phone' => '+9607820288', 'email' => 'owner@example.com', 'is_active' => true]);

        $this->text('7820288', 'Shift #4 has been open for 14 hours. Close it in the POS.', 'owner_shift_left_open');

        Mail::assertSent(SmsCopyMail::class, function (SmsCopyMail $m) use ($owner) {
            $html = $m->render();

            return $m->hasTo($owner->email)
                && $m->subject === 'Alert: Shift left open'
                && str_contains($html, 'Staff alert')
                && str_contains($html, 'For the team');
        });
    }

    public function test_promotions_carry_a_working_unsubscribe_and_an_opted_out_customer_gets_neither(): void
    {
        $c = $this->customer();
        $this->text('7771234', 'Weekend deal: 20% off grills. Order: https://bakeandgrill.mv/order', 'marketing_campaign', $c->id);

        $url = null;
        Mail::assertSent(SmsCopyMail::class, function (SmsCopyMail $m) use (&$url) {
            $url = $m->unsubscribeUrl();
            $html = $m->render();

            return $url !== null
                && ($m->headers()->text['List-Unsubscribe'] ?? null) === '<' . $url . '>'
                && str_contains($html, 'Stop promotional messages (SMS and email)')
                // The SMS's own "Stop: …/sms" line is not repeated in the email.
                && !str_contains($html, '/sms</a>');
        });

        // One-click unsubscribe, as a mail app sends it.
        $this->post($url, ['List-Unsubscribe' => 'One-Click'])->assertNoContent();
        $this->assertTrue((bool) $c->fresh()->sms_opt_out);
        $this->assertSame('email_link', $c->fresh()->sms_opt_out_source);

        Mail::fake();
        $this->travel(2)->days();
        $this->text('7771234', 'Another deal', 'marketing_campaign', $c->id);
        Mail::assertNothingSent();
    }

    public function test_the_unsubscribe_page_needs_the_signed_link_and_a_press(): void
    {
        $c = $this->customer();
        $url = URL::signedRoute('email.unsubscribe', ['customer' => $c->id]);

        $this->get(route('email.unsubscribe', ['customer' => $c->id]))->assertForbidden();
        $this->get($url)->assertOk()->assertSee('Stop promotional messages');
        $this->assertFalse((bool) $c->fresh()->sms_opt_out, 'opening the link alone must not unsubscribe');

        $this->post($url)->assertOk()->assertSee('email-unsub-done', false);
        $this->assertTrue((bool) $c->fresh()->sms_opt_out);
    }

    public function test_texts_that_already_have_their_own_email_are_not_copied(): void
    {
        $c = $this->customer();
        $this->text('7771234', '#A12 confirmed. Track: https://bakeandgrill.mv/order/orders/12', 'customer_order_confirmed', $c->id);

        Mail::assertNotSent(SmsCopyMail::class);
    }

    /**
     * A row's Email switch is its only email switch (re-audit, 2026-10-10):
     * the old "email copies" switches for customers, staff and promotions
     * are gone.
     */
    public function test_a_rows_email_switch_is_the_only_one(): void
    {
        $c = $this->customer();
        User::factory()->create(['phone' => '+9607820288', 'email' => 'owner@example.com', 'is_active' => true]);
        SmsTypeRegistry::setEmailEnabled('customer_order_ready', false);
        SmsTypeRegistry::setEmailEnabled('owner_shift_left_open', false);

        $this->text('7771234', 'Your order is ready.', 'customer_order_ready', $c->id);
        $this->text('7820288', 'Shift open for 14 hours.', 'owner_shift_left_open');
        Mail::assertNotSent(SmsCopyMail::class);

        SmsTypeRegistry::setEmailEnabled('owner_shift_left_open', true);
        $this->text('7820288', 'Shift open for 15 hours.', 'owner_shift_left_open', key: 'shift-15');
        Mail::assertSent(SmsCopyMail::class, 1);

        $this->assertArrayNotHasKey('email_copy_staff', SmsDeliveryRules::all());
        $this->assertArrayHasKey('email_copy_hourly_cap', SmsDeliveryRules::all());
    }

    /** An address typed on an alert's row gets the message by email alone (AlertAudience "emails"). */
    public function test_a_typed_email_address_gets_the_alert_by_email(): void
    {
        $this->text('email:events@example.com', 'New event EVT-1.', 'catering_request_staff', key: 'evt-1');

        Mail::assertSent(SmsCopyMail::class, fn (SmsCopyMail $m) => $m->hasTo('events@example.com') && $m->smsSent === false);
        $row = SmsLog::query()->where('to', 'email:events@example.com')->firstOrFail();
        $this->assertSame('suppressed', $row->status);
        $this->assertSame(SmsLog::SENT_BY_EMAIL, $row->error_message);
        $this->assertTrue($row->reachedRecipient());

        SmsTypeRegistry::setEmailEnabled('catering_request_staff', false);
        $this->text('email:events@example.com', 'New event EVT-2.', 'catering_request_staff', key: 'evt-2');
        Mail::assertSent(SmsCopyMail::class, 1);
        $this->assertSame('failed', SmsLog::query()->where('idempotency_key', 'evt-2')->value('status'));
    }

    public function test_a_retried_text_is_emailed_once(): void
    {
        $c = $this->customer();
        // The provider fails the first time; the caller retries with the same key.
        $provider = Mockery::mock(SmsProviderInterface::class);
        $provider->shouldReceive('send')->once()->andReturn([false, ['err' => 1], 'timeout']);
        $provider->shouldReceive('send')->once()->andReturn([true, ['ok' => true], null]);
        $this->app->instance(SmsProviderInterface::class, $provider);
        $this->app->forgetInstance(SmsService::class);

        $this->text('7771234', 'Your order is ready.', 'customer_order_ready', $c->id, 'order:ready:12');
        $this->text('7771234', 'Your order is ready.', 'customer_order_ready', $c->id, 'order:ready:12');

        Mail::assertSent(SmsCopyMail::class, 1);
    }

    public function test_the_hourly_cap_holds_and_promotions_get_half(): void
    {
        SmsDeliveryRules::update(['email_copy_hourly_cap' => 4, 'marketing_daily_cap' => 0]);
        foreach (range(1, 6) as $i) {
            $c = $this->customer(['phone' => '+96077700' . str_pad((string) $i, 2, '0', STR_PAD_LEFT), 'email' => "c{$i}@example.com"]);
            $this->text($c->phone, "Deal {$i}", 'marketing_campaign', $c->id);
        }
        Mail::assertSent(SmsCopyMail::class, 2);

        // Order texts still have room in the hour.
        $c = $this->customer(['phone' => '+9607779999', 'email' => 'order@example.com']);
        $this->text($c->phone, 'Your order is ready.', 'customer_order_ready', $c->id);
        Mail::assertSent(SmsCopyMail::class, 3);
    }

    public function test_nobody_with_an_email_means_no_email(): void
    {
        $c = $this->customer(['email' => null]);
        $this->text('7771234', 'Your order is ready.', 'customer_order_ready', $c->id);
        $this->text('7000001', 'Shift open.', 'owner_shift_left_open');

        Mail::assertNotSent(SmsCopyMail::class);
    }

    public function test_link_labels_say_what_the_link_opens(): void
    {
        $this->assertSame('Pay now', SmsCopyMail::linkLabel('https://bakeandgrill.mv/pay/abc'));
        $this->assertSame('View invoice', SmsCopyMail::linkLabel('https://bakeandgrill.mv/invoices/abc'));
        $this->assertSame('View receipt', SmsCopyMail::linkLabel('https://bakeandgrill.mv/receipts/abc'));
        $this->assertSame('View your booking', SmsCopyMail::linkLabel('https://bakeandgrill.mv/reservations/abc'));
        $this->assertSame('Open link', SmsCopyMail::linkLabel('https://example.com/x'));
        $this->assertSame('Weekend deal', SmsCopyMail::withoutOptOutLine("Weekend deal\nStop: bakeandgrill.mv/sms"));
        // Links become buttons: "Track:" goes with its link, other words stay.
        $this->assertSame('Ready to collect.', SmsCopyMail::withoutLinks('Ready to collect. Track: https://bakeandgrill.mv/order/orders/1'));
        $this->assertSame('Your gift card from Ali', SmsCopyMail::withoutLinks('Your gift card from Ali: https://bakeandgrill.mv/gift/x'));
        $this->assertSame('Shift open 14 hours. Close it in the POS', SmsCopyMail::withoutLinks('Shift open 14 hours. Close it in the POS: https://bakeandgrill.mv/pos'));
    }

    // ── SMS and email have separate switches (owner, 2026-10-06) ─────────────

    private function provider(int $smsTimes): void
    {
        $provider = Mockery::mock(SmsProviderInterface::class);
        $provider->shouldReceive('send')->times($smsTimes)->andReturn([true, ['ok' => true], null]);
        $this->app->instance(SmsProviderInterface::class, $provider);
        $this->app->forgetInstance(SmsService::class);
    }

    public function test_switching_a_type_sms_off_still_sends_its_email(): void
    {
        $c = $this->customer();
        $this->provider(0);
        $entry = SmsTypeRegistry::get('customer_order_ready');
        SiteSetting::set($entry['enabled_setting'], 'false');

        $this->text('7771234', 'Your order is ready to collect.', 'customer_order_ready', $c->id);

        $this->assertSame('disabled', SmsLog::latest('id')->value('status'));
        Mail::assertSent(SmsCopyMail::class, fn (SmsCopyMail $m) => $m->hasTo('aishath@example.com')
            && !$m->smsSent
            && str_contains($m->render(), 'Sent to you by email.'));
    }

    public function test_switching_a_type_email_off_keeps_its_sms(): void
    {
        $c = $this->customer();
        $this->provider(1);
        SmsTypeRegistry::setEmailEnabled('customer_order_ready', false);

        $this->text('7771234', 'Your order is ready.', 'customer_order_ready', $c->id);

        $this->assertSame('sent', SmsLog::latest('id')->value('status'));
        Mail::assertNotSent(SmsCopyMail::class);
    }

    public function test_both_off_sends_nothing(): void
    {
        $c = $this->customer();
        $this->provider(0);
        SiteSetting::set(SmsTypeRegistry::get('customer_order_ready')['enabled_setting'], 'false');
        SmsTypeRegistry::setEmailEnabled('customer_order_ready', false);

        $this->text('7771234', 'Your order is ready.', 'customer_order_ready', $c->id);

        Mail::assertNotSent(SmsCopyMail::class);
    }

    public function test_the_sms_kill_switch_leaves_email_going(): void
    {
        $c = $this->customer();
        User::factory()->create(['phone' => '+9607820288', 'email' => 'owner@example.com', 'is_active' => true]);
        $this->provider(0);
        SiteSetting::set('sms_global_kill_switch', 'true');
        $this->assertTrue(SmsTypeRegistry::isGlobalKillSwitchOn());

        $this->text('7771234', 'Your order is ready.', 'customer_order_ready', $c->id);
        $this->text('7820288', 'Shift open for 14 hours.', 'owner_shift_left_open');

        Mail::assertSent(SmsCopyMail::class, 2);
    }

    public function test_a_caller_whose_own_switch_is_off_can_send_email_only(): void
    {
        $c = $this->customer();
        $this->provider(0);

        app(SmsService::class)->send(new SmsMessage(to: '7771234', message: 'Your order is ready.', type: 'customer_order_ready', customerId: $c->id, emailOnly: true));
        DeferAfterResponse::flushTestingCallbacks();

        $this->assertStringContainsString('email only', (string) SmsLog::latest('id')->value('error_message'));
        Mail::assertSent(SmsCopyMail::class, 1);
    }

    public function test_sms_off_does_not_bypass_a_promotion_opt_out(): void
    {
        $c = $this->customer(['sms_opt_out' => true]);
        $this->provider(0);
        SiteSetting::set(SmsTypeRegistry::get('marketing_campaign')['enabled_setting'], 'false');

        $this->text('7771234', 'Weekend deal', 'marketing_campaign', $c->id);

        Mail::assertNotSent(SmsCopyMail::class);
    }

    public function test_a_staff_member_without_permission_gets_neither(): void
    {
        $c = $this->customer();
        $this->provider(0);
        $cashier = User::factory()->create(['is_active' => true]);
        $entry = SmsTypeRegistry::get('pos_send_bill');
        $this->assertNotEmpty(SmsTypeRegistry::effectiveSendPermission($entry), 'pos_send_bill needs a send permission for this test');

        app(SmsService::class)->send(new SmsMessage(to: '7771234', message: 'Bill: https://bakeandgrill.mv/invoices/x', type: 'pos_send_bill', customerId: $c->id, actingUserId: $cashier->id));
        DeferAfterResponse::flushTestingCallbacks();

        Mail::assertNotSent(SmsCopyMail::class);
    }

}
