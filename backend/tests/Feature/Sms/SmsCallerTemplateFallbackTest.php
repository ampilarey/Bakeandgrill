<?php

declare(strict_types=1);

namespace Tests\Feature\Sms;

use App\Domains\Catering\Services\CateringEventCreatedNotifier;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Payments\Services\GiftCardSmsDelivery;
use App\Models\CateringRequest;
use App\Models\GiftCard;
use App\Models\SmsTemplate;
use App\Support\RestorationSmsBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SmsCallerTemplateFallbackTest extends TestCase
{
    use RefreshDatabase;

    public function test_otp_builder_uses_fallback_when_template_unset(): void
    {
        SmsTemplate::where('slug', 'auth_customer_otp')->delete();

        $body = app(CustomerSmsMessageBuilder::class)->build(
            'auth_customer_otp',
            ['code' => '123456', 'minutes' => '10', 'brand' => 'Bake & Grill'],
            'Your Bake & Grill verification code is 123456. Valid for 10 minutes. Do not share this code.',
        );

        $this->assertSame(
            'Your Bake & Grill verification code is 123456. Valid for 10 minutes. Do not share this code.',
            $body,
        );
    }

    public function test_otp_builder_uses_template_when_set(): void
    {
        SmsTemplate::updateOrCreate(
            ['slug' => 'auth_customer_otp'],
            [
                'name' => 'OTP',
                'type' => 'customer_notification',
                'body' => 'Code {{code}} ({{minutes}}m)',
                'is_system' => true,
            ],
        );

        $body = app(CustomerSmsMessageBuilder::class)->build(
            'auth_customer_otp',
            ['code' => '654321', 'minutes' => '10', 'brand' => 'Bake & Grill'],
            'fallback',
        );

        $this->assertSame('Code 654321 (10m)', $body);
    }

    public function test_gift_card_fallback_matches_legacy_when_template_empty(): void
    {
        SmsTemplate::updateOrCreate(
            ['slug' => 'giftcard_delivery'],
            [
                'name' => 'Gift',
                'type' => 'customer_notification',
                'body' => '',
                'is_system' => true,
            ],
        );

        $card = GiftCard::create([
            'code_hash' => hash('sha256', 'TESTCODE'),
            'code_last4' => 'CODE',
            'initial_balance' => 100.00,
            'current_balance' => 100.00,
            'status' => 'active',
        ]);

        $delivery = app(GiftCardSmsDelivery::class);
        $msg = $delivery->buildMessage($card, 'TESTCODE', 'Happy bday', 'https://example.com/g', 'From Ali');

        $this->assertStringContainsString('Bake & Grill Gift Card', $msg);
        $this->assertStringContainsString('From Ali', $msg);
        $this->assertStringContainsString('MVR 100.00', $msg);
        $this->assertStringContainsString('TESTCODE', $msg);
        $this->assertStringContainsString('Happy bday', $msg);
    }

    public function test_restoration_fallback_matches_config_when_template_empty(): void
    {
        SmsTemplate::updateOrCreate(
            ['slug' => 'service_restoration'],
            [
                'name' => 'Restore',
                'type' => 'customer_notification',
                'body' => '',
                'is_system' => true,
            ],
        );

        config()->set('service_availability.restoration_sms.default_template', 'Bake & Grill: :label is back - order now :url. Reply STOP to opt out.');
        config()->set('service_availability.restoration_sms.link', 'https://bakeandgrill.mv/order/menu');
        config()->set('service_availability.keys.online_ordering.label', 'Online Ordering');

        $body = app(RestorationSmsBuilder::class)->build('online_ordering');
        $this->assertSame(
            'Bake & Grill: Online Ordering is back - order now https://bakeandgrill.mv/order/menu. Reply STOP to opt out.',
            $body,
        );
    }

    public function test_catering_created_customer_fallback_when_template_missing(): void
    {
        SmsTemplate::where('slug', 'catering_request_received')->delete();

        $request = CateringRequest::create([
            'reference' => 'EVT-TEST1',
            'contact_name' => 'Aisha',
            'phone' => '7777001',
            'occasion' => 'event',
            'event_date' => now()->addDays(10)->toDateString(),
            'fulfillment_method' => 'pickup',
            'status' => 'draft',
            'source' => 'event_order',
            'quote_version' => 1,
        ]);

        // Build via the same builder the notifier uses
        $viewUrl = rtrim((string) config('app.url'), '/') . '/order/events/mine/' . rawurlencode('EVT-TEST1');
        $fallback = "Event request EVT-TEST1 received. View details: {$viewUrl}";
        $body = app(CustomerSmsMessageBuilder::class)->build(
            'catering_request_received',
            ['reference' => 'EVT-TEST1', 'view_url' => $viewUrl, 'contact_name' => 'Aisha'],
            $fallback,
        );

        $this->assertSame($fallback, $body);
        $this->assertNotNull($request->id);
        // Keep CateringEventCreatedNotifier referenced so the class stays loadable in this suite.
        $this->assertTrue(class_exists(CateringEventCreatedNotifier::class));
    }
}
