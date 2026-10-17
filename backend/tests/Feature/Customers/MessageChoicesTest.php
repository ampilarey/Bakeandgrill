<?php

declare(strict_types=1);

namespace Tests\Feature\Customers;

use App\Domains\Customers\Support\MessageChoices;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Mail\SmsCopyMail;
use App\Models\Customer;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Account → Messages (iruali import plan, feature 5): order, delivery and
 * offer messages by SMS, email, both or neither; sign-in codes always.
 */
class MessageChoicesTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->customer = Customer::create(['name' => 'Aisha', 'phone' => '+9607771111', 'email' => 'aisha@example.mv', 'is_active' => true]);
    }

    private function text(string $type): SmsLog
    {
        return app(SmsService::class)->send(new SmsMessage(to: '+9607771111', message: 'Hello from ' . $type, type: $type, customerId: $this->customer->id, idempotencyKey: $type . ':' . uniqid()));
    }

    public function test_the_kinds_follow_the_registry(): void
    {
        $this->assertSame('orders', MessageChoices::kindOf('customer_order_ready'));
        $this->assertSame('delivery', MessageChoices::kindOf('customer_order_on_the_way'));
        $this->assertSame('offers', MessageChoices::kindOf('marketing_campaign'));
        $this->assertSame('security', MessageChoices::kindOf('auth_customer_otp'));
        $this->assertNull(MessageChoices::kindOf('customer_refund_completed'), 'refund notices are not the customer\'s to turn off');
        $this->assertNull(MessageChoices::kindOf('pos_send_bill'), 'asked for at the till');
    }

    public function test_defaults_are_orders_both_delivery_sms_offers_by_text_only_security_locked(): void
    {
        $this->assertSame([
            'orders' => ['sms' => true, 'email' => true, 'locked' => false],
            'delivery' => ['sms' => true, 'email' => false, 'locked' => false],
            'offers' => ['sms' => true, 'email' => false, 'locked' => false],
            'security' => ['sms' => true, 'email' => true, 'locked' => true],
        ], MessageChoices::for($this->customer));
    }

    public function test_the_customer_saves_choices_and_order_texts_stop(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);
        $this->patchJson('/api/customer/profile', ['message_choices' => [
            'orders' => ['sms' => false, 'email' => true],
            'offers' => ['sms' => false],
            'security' => ['sms' => false],
        ]])->assertOk()
            ->assertJsonPath('customer.message_choices.orders.sms', false)
            ->assertJsonPath('customer.message_choices.security.sms', true);

        $this->assertTrue($this->customer->fresh()->sms_opt_out, 'offers by text is the SMS opt-out');

        $log = $this->text('customer_order_ready');
        $this->assertSame('suppressed', $log->status);
        $this->assertStringContainsString('chose no SMS for order updates', (string) $log->error_message);
        $this->assertNotSame('suppressed', $this->text('customer_order_on_the_way')->status, 'delivery texts still go');
        $this->assertNotSame('suppressed', $this->text('auth_customer_otp')->status, 'sign-in codes always go');
    }

    public function test_offers_by_email_need_the_customer_to_ask_and_a_checked_email(): void
    {
        $this->assertFalse(MessageChoices::allows($this->customer, 'offers', 'email'));
        MessageChoices::update($this->customer, ['offers' => ['email' => true]]);
        $this->assertFalse(MessageChoices::allows($this->customer->fresh(), 'offers', 'email'), 'the email is not checked yet');

        $this->customer->forceFill(['email_verified_at' => now()])->save();
        $this->assertTrue(MessageChoices::allows($this->customer->fresh(), 'offers', 'email'));
    }

    public function test_no_email_copy_of_an_order_update_the_customer_turned_off(): void
    {
        MessageChoices::update($this->customer, ['orders' => ['email' => false]]);

        $this->text('customer_order_ready');

        Mail::assertNotSent(SmsCopyMail::class);
    }

    public function test_the_link_in_an_offers_email_stops_offers_both_ways(): void
    {
        $this->customer->forceFill(['email_verified_at' => now(), 'message_prefs' => ['offers' => ['email' => true]]])->save();

        $this->post(URL::signedRoute('email.unsubscribe.store', ['customer' => $this->customer->id]))->assertOk();

        $choices = MessageChoices::for($this->customer->fresh());
        $this->assertFalse($choices['offers']['email']);
        $this->assertFalse($choices['offers']['sms']);
    }
}
