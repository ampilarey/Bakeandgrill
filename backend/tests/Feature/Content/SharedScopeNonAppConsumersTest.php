<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Console\Commands\CheckReorderPoints;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Signage\Services\SignageResolver;
use App\Models\Complaint;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Receipt;
use App\Models\SmsLog;
use App\Models\SiteSetting;
use App\Support\DocumentBrandView;
use Illuminate\Console\OutputStyle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Mockery;
use ReflectionMethod;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Output\NullOutput;
use Tests\TestCase;

/**
 * Stages 1–3 must leave shared-scope operational readers untouched.
 * Each assertion fails if the consumer falls through to its hardcoded default
 * instead of the distinct shared value we plant.
 */
class SharedScopeNonAppConsumersTest extends TestCase
{
    use RefreshDatabase;

    private const PHONE = '+960 700 1111';

    private const WHATSAPP = 'https://wa.me/9607001111';

    private const SITE = 'Shared Scope Café';

    private const EMAIL = 'ops-shared@bakegrill.test';

    private const ADDRESS = 'Shared Scope Street 1, Malé';

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        SiteSetting::set('site_name', self::SITE, 'shared');
        SiteSetting::set('business_phone', self::PHONE, 'shared');
        SiteSetting::set('business_email', self::EMAIL, 'shared');
        SiteSetting::set('business_address', self::ADDRESS, 'shared');
        SiteSetting::set('business_whatsapp', self::WHATSAPP, 'shared');
        SiteSetting::set('business_phone', '+960 APP WEB', 'website');
        SiteSetting::set('business_phone', '+960 APP ORDER', 'order_app');
        SiteSetting::bust();
    }

    public function test_document_brand_view_reads_shared_business_facts(): void
    {
        $vars = DocumentBrandView::variables();

        $this->assertSame(self::SITE, $vars['brandSiteName']);
        $this->assertSame(self::PHONE, $vars['brandPhone']);
        $this->assertSame(self::EMAIL, $vars['brandEmail']);
        $this->assertSame(self::ADDRESS, $vars['brandAddress']);
        $this->assertNotSame(config('business.phone'), $vars['brandPhone']);
    }

    public function test_signage_resolver_reads_shared_site_name_and_phone(): void
    {
        $resolver = app(SignageResolver::class);
        $method = new ReflectionMethod(SignageResolver::class, 'variables');
        $method->setAccessible(true);
        $vars = $method->invoke($resolver, now());

        $this->assertSame(self::SITE, $vars['branch_name']);
        $this->assertSame(self::PHONE, $vars['business_phone']);
        $this->assertNotSame('Bake & Grill', $vars['branch_name']);
        $this->assertNotSame('', $vars['business_phone']);
    }

    public function test_public_complaint_whatsapp_link_uses_shared_business_whatsapp(): void
    {
        SiteSetting::query()->updateOrCreate(
            ['key' => 'complaint_open_cap_per_receipt', 'scope' => 'shared', 'locale' => 'en'],
            [
                'value' => '1',
                'type' => 'text',
                'group' => 'Complaints',
                'label' => 'cap',
                'is_public' => false,
            ],
        );

        $customer = $this->makeCustomer([
            'phone' => '+9607'.str_pad((string) random_int(100000, 999999), 6, '0'),
            'sms_opt_out' => false,
        ]);
        $order = $this->makePaidOrder($customer, [
            'order_number' => 'BG-COMP-'.Str::upper(Str::random(4)),
            'type' => 'takeaway',
            'total' => 40,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_name' => 'Shared Scope Bun',
            'quantity' => 1,
            'unit_price' => 40,
            'total_price' => 40,
        ]);
        $receipt = Receipt::create([
            'order_id' => $order->id,
            'token' => Str::random(48),
            'channel' => 'sms',
            'recipient' => $customer->phone,
        ]);

        $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [Complaint::CATEGORY_TOO_LONG],
            'idempotency_key' => 'cap-a',
        ])->assertCreated();

        $res = $this->postJson('/api/receipts/'.$receipt->token.'/complaints', [
            'categories' => [Complaint::CATEGORY_SOMETHING_ELSE],
            'idempotency_key' => 'cap-b',
        ])->assertStatus(422);

        $this->assertTrue($res->json('at_open_cap'));
        $href = (string) $res->json('whatsapp_href');
        $this->assertStringStartsWith(self::WHATSAPP, $href);
        $this->assertStringNotContainsString('9609120011', $href);
    }

    public function test_check_reorder_points_fallback_uses_shared_business_phone(): void
    {
        SiteSetting::set('ops_inventory_reorder_alert_sms', '1', 'shared');

        $sms = Mockery::mock(SmsService::class);
        $captured = [];
        $sms->shouldReceive('send')
            ->once()
            ->with(Mockery::on(function (SmsMessage $msg) use (&$captured): bool {
                $captured[] = $msg->to;

                return $msg->to === self::PHONE;
            }))
            ->andReturn(new SmsLog);

        $command = app(CheckReorderPoints::class);
        $command->setOutput(new OutputStyle(new ArrayInput([]), new NullOutput));
        $method = new ReflectionMethod(CheckReorderPoints::class, 'maybeSendReorderSms');
        $method->setAccessible(true);
        $method->invoke($command, $sms, ['Test Flour']);

        $this->assertSame([self::PHONE], $captured);
    }

    public function test_alert_delivery_delays_fallback_uses_shared_business_phone(): void
    {
        SiteSetting::set('ops_delivery_delay_alert_sms', '1', 'shared');

        Order::create([
            'order_number' => 'D-DELAY-1',
            'type' => 'delivery',
            'status' => 'out_for_delivery',
            'subtotal' => 50,
            'total' => 50,
            'delivery_eta_at' => now()->subMinutes(45),
            'fired_at' => now()->subHour(),
            'estimated_wait_minutes' => 20,
        ]);

        $sms = Mockery::mock(SmsService::class);
        $captured = [];
        $sms->shouldReceive('send')
            ->once()
            ->with(Mockery::on(function (SmsMessage $msg) use (&$captured): bool {
                $captured[] = $msg->to;

                return $msg->to === self::PHONE;
            }))
            ->andReturn(new SmsLog);

        $this->app->instance(SmsService::class, $sms);

        $this->artisan('ops:alert-delivery-delays', ['--minutes' => 15])
            ->assertSuccessful();

        $this->assertSame([self::PHONE], $captured);
    }
}
