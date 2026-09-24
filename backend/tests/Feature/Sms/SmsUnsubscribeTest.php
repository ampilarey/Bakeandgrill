<?php

declare(strict_types=1);

namespace Tests\Feature\Sms;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\SmsDeliveryRules;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

/**
 * SMS audit, 2026-09-24: unsubscribe that works — a page on the site, a
 * link in the footer and at the end of every marketing text, a switch in
 * the order app, and a record of where each opt-out came from.
 */
class SmsUnsubscribeTest extends TestCase
{
    use RefreshDatabase;

    private Customer $aisha;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->aisha = Customer::create(['name' => 'Aisha', 'phone' => '+9607771234', 'loyalty_points' => 0, 'tier' => 'bronze', 'is_active' => true, 'sms_opt_out' => false]);
    }

    public function test_the_page_opts_a_number_out_and_answers_the_same_for_unknown_numbers(): void
    {
        $this->get('/sms')->assertRedirect(route('sms.preferences'));
        $this->get('/sms/preferences')->assertOk()->assertSee('Stop promotional SMS')->assertSee('data-testid="sms-pref-submit"', false);

        $this->followingRedirects()->post('/sms/preferences', ['phone' => '7771234'])->assertOk()->assertSee('data-testid="sms-pref-done"', false);
        $fresh = $this->aisha->fresh();
        $this->assertTrue($fresh->sms_opt_out);
        $this->assertSame('web_form', $fresh->sms_opt_out_source);
        $this->assertNotNull($fresh->sms_opt_out_at);

        $this->followingRedirects()->post('/sms/preferences', ['phone' => '7770000'])->assertOk()->assertSee('data-testid="sms-pref-done"', false);
        $this->post('/sms/preferences', ['phone' => '12'])->assertSessionHasErrors('phone');
    }

    public function test_the_footer_and_the_privacy_page_point_at_it(): void
    {
        $this->get('/')->assertOk()->assertSee('/sms/preferences');
        $this->get('/privacy')->assertOk()->assertSee('/sms/preferences');
    }

    public function test_every_marketing_text_ends_with_the_unsubscribe_link_and_no_other_text_does(): void
    {
        $provider = Mockery::mock(SmsProviderInterface::class);
        $sent = [];
        $provider->shouldReceive('send')->andReturnUsing(function (string $to, string $message) use (&$sent) {
            $sent[] = $message;

            return [true, ['ok' => true], null];
        });
        $this->app->instance(SmsProviderInterface::class, $provider);
        $sms = app(SmsService::class);
        $short = SmsDeliveryRules::optOutUrl();

        $promo = $sms->send(new SmsMessage(to: '+9607771234', message: 'Friday deal: 20% off', type: 'marketing_promotion'));
        $this->assertSame("Friday deal: 20% off\nStop: {$short}", $promo->message);
        $this->assertSame($promo->message, $sent[0], 'what went to the carrier');

        $ready = $sms->send(new SmsMessage(to: '+9607771234', message: '#1042 is ready', type: 'customer_order_ready'));
        $this->assertSame('#1042 is ready', $ready->message);

        $sms->send(new SmsMessage(to: '+9607771234', message: "Already there. Stop: {$short}", type: 'marketing_campaign', idempotencyKey: 'x1'));
        $this->assertStringNotContainsString("Stop: {$short}\nStop", end($sent), 'not appended twice');

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->patchJson('/api/admin/sms/delivery-rules', ['marketing_opt_out_line' => 'Unsubscribe at {url}'])->assertOk()
            ->assertJsonPath('delivery_rules.marketing_opt_out_line', 'Unsubscribe at {url}');
        SmsDeliveryRules::update(['marketing_daily_cap' => 0]);
        $this->assertStringEndsWith("Unsubscribe at {$short}", $sms->send(new SmsMessage(to: '+9607771234', message: 'Deal 2', type: 'marketing_campaign'))->message);

        $this->patchJson('/api/admin/sms/delivery-rules', ['marketing_opt_out_line' => ''])->assertOk();
        $this->assertSame('Deal 3', $sms->send(new SmsMessage(to: '+9607771234', message: 'Deal 3', type: 'marketing_campaign'))->message, 'line switched off');
    }

    public function test_the_order_app_switch_records_its_source_and_admin_records_its_own(): void
    {
        Sanctum::actingAs($this->aisha, ['customer']);
        $this->getJson('/api/customer/me')->assertOk()->assertJsonPath('customer.sms_opt_out', false);

        $this->patchJson('/api/customer/profile', ['sms_opt_out' => true])->assertOk()->assertJsonPath('customer.sms_opt_out', true);
        $this->assertSame('order_app', $this->aisha->fresh()->sms_opt_out_source);
        $this->assertNotNull($this->aisha->fresh()->sms_opt_out_at);

        $this->patchJson('/api/customer/profile', ['sms_opt_out' => false])->assertOk()->assertJsonPath('customer.sms_opt_out', false);
        $this->assertNull($this->aisha->fresh()->sms_opt_out_at);

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->patchJson("/api/admin/customers/{$this->aisha->id}", ['sms_opt_out' => true])->assertOk();
        $this->assertSame('admin', $this->aisha->fresh()->sms_opt_out_source);

        $this->postJson('/api/customer/sms/opt-out', ['phone' => '+9607771234'])->assertOk();
        $this->assertSame('api', $this->aisha->fresh()->sms_opt_out_source);
    }
}
