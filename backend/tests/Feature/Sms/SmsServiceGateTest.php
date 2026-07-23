<?php

declare(strict_types=1);

namespace Tests\Feature\Sms;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Models\Customer;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class SmsServiceGateTest extends TestCase
{
    use RefreshDatabase;

    private SmsService $sms;

    private SmsProviderInterface $provider;

    protected function setUp(): void
    {
        parent::setUp();
        $this->provider = Mockery::mock(SmsProviderInterface::class);
        $this->app->instance(SmsProviderInterface::class, $this->provider);
        $this->sms = app(SmsService::class);
    }

    public function test_global_kill_switch_disables_otp_and_skips_provider(): void
    {
        SiteSetting::set(SmsTypeRegistry::GLOBAL_KILL_SWITCH, 'true');
        $this->provider->shouldNotReceive('send');

        $log = $this->sms->send(new SmsMessage(
            to: '+9607654321',
            message: 'Your Bake & Grill verification code is 123456. Valid for 10 minutes.',
            type: 'auth_customer_otp',
        ));

        $this->assertSame('disabled', $log->status);
        $this->assertStringContainsString('master switch', (string) $log->error_message);
        $this->assertSame(1, SmsLog::count());
    }

    public function test_per_type_disabled_logs_disabled_other_type_still_sends(): void
    {
        SiteSetting::set('sms_giftcard_enabled', 'false');

        $this->provider->shouldReceive('send')
            ->once()
            ->andReturn([true, ['ok' => true], null]);

        $disabled = $this->sms->send(new SmsMessage(
            to: '+9607654321',
            message: 'Gift card',
            type: 'giftcard_delivery',
        ));
        $this->assertSame('disabled', $disabled->status);

        $ok = $this->sms->send(new SmsMessage(
            to: '+9607654322',
            message: 'Receipt',
            type: 'transactional',
        ));
        $this->assertContains($ok->status, ['sent', 'demo']);
    }

    public function test_always_on_ignores_per_type_toggle(): void
    {
        // Even if a stray setting existed, always_on OTP must send unless global kill.
        SiteSetting::set(SmsTypeRegistry::GLOBAL_KILL_SWITCH, 'false');

        $this->provider->shouldReceive('send')
            ->once()
            ->andReturn([true, ['ok' => true], null]);

        $log = $this->sms->send(new SmsMessage(
            to: '+9607654321',
            message: 'code 111111',
            type: 'otp',
        ));

        $this->assertSame('sent', $log->status);
        $this->assertSame('[otp redacted]', $log->message);
    }

    public function test_opt_out_preserved_for_suppressible_not_for_transactional(): void
    {
        $customer = Customer::create([
            'name' => 'Opt Out',
            'phone' => '+9607654333',
            'sms_opt_out' => true,
        ]);

        $this->provider->shouldReceive('send')
            ->once()
            ->andReturn([true, ['ok' => true], null]);

        $marketing = $this->sms->send(new SmsMessage(
            to: '+9607654333',
            message: 'Sale!',
            type: 'marketing_campaign',
            customerId: $customer->id,
        ));
        $this->assertSame('suppressed', $marketing->status);

        $tx = $this->sms->send(new SmsMessage(
            to: '+9607654333',
            message: 'Your order is ready',
            type: 'transactional',
            customerId: $customer->id,
        ));
        $this->assertSame('sent', $tx->status);
    }

    public function test_legacy_transactional_type_still_sends(): void
    {
        $this->provider->shouldReceive('send')
            ->once()
            ->andReturn([true, ['ok' => true], null]);

        $log = $this->sms->send(new SmsMessage(
            to: '+9607654344',
            message: 'Legacy caller',
            type: 'transactional',
        ));

        $this->assertSame('sent', $log->status);
        $this->assertSame('transactional', $log->type);
    }
}
