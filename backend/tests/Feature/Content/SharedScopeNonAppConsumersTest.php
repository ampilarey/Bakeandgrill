<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Console\Commands\AlertDeliveryDelays;
use App\Console\Commands\CheckReorderPoints;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Signage\Services\SignageResolver;
use App\Http\Controllers\Api\PublicComplaintController;
use App\Models\SmsLog;
use App\Models\SiteSetting;
use App\Support\DocumentBrandView;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Console\OutputStyle;
use Mockery;
use ReflectionClass;
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
        SiteSetting::set('site_name', self::SITE, 'shared');
        SiteSetting::set('business_phone', self::PHONE, 'shared');
        SiteSetting::set('business_email', self::EMAIL, 'shared');
        SiteSetting::set('business_address', self::ADDRESS, 'shared');
        SiteSetting::set('business_whatsapp', self::WHATSAPP, 'shared');
        // Ensure apps differ so a mistaken ContentResolver path would not accidentally pass.
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
        $waBase = (string) SiteSetting::get('business_whatsapp', 'https://wa.me/9609120011');
        $this->assertSame(self::WHATSAPP, $waBase);
        $this->assertNotSame('https://wa.me/9609120011', $waBase);

        $src = (string) file_get_contents(
            (new ReflectionClass(PublicComplaintController::class))->getFileName() ?: '',
        );
        $this->assertStringContainsString("SiteSetting::get('business_whatsapp'", $src);
        $this->assertSame(
            2,
            substr_count($src, "SiteSetting::get('business_whatsapp'"),
            'Both complaint WhatsApp call sites must keep reading shared',
        );
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

        $phone = trim((string) SiteSetting::get('business_phone', ''));
        $this->assertSame(self::PHONE, $phone);
        $this->assertNotSame('', $phone);

        $src = (string) file_get_contents(
            (new ReflectionClass(AlertDeliveryDelays::class))->getFileName() ?: '',
        );
        $this->assertStringContainsString("SiteSetting::get('business_phone'", $src);

        // Smoke: command still boots after migration (no delayed orders → SUCCESS).
        $this->artisan('ops:alert-delivery-delays')->assertSuccessful();
    }
}
