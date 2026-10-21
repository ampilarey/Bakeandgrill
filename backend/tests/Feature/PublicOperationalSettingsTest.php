<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\SiteSetting;
use App\Support\PublicOperationalSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * The till and the order app price a ticket from the service charge settings
 * in the public settings payload (2026-10-21: the content registry had taken
 * the payload over and dropped them, so a dine-in cart showed no service
 * charge and Charge stopped with "Order total changed").
 */
class PublicOperationalSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    private function setServiceCharge(array $values): void
    {
        foreach ($values as $key => $value) {
            SiteSetting::set($key, $value);
        }
        SiteSetting::bust();
    }

    public function test_the_public_settings_carry_the_service_charge_the_till_prices_with(): void
    {
        $this->setServiceCharge([
            'service_charge_enabled' => '1',
            'service_charge_label' => 'Service 10%',
            'service_charge_type' => 'percent',
            'service_charge_value' => '10',
            'service_charge_apply_dine_in' => '1',
            'service_charge_apply_takeaway' => '0',
            'service_charge_taxable' => '0',
        ]);

        $settings = $this->getJson('/api/site-settings/public')->assertOk()->json('settings');

        $this->assertSame('1', $settings['service_charge_enabled']);
        $this->assertSame('Service 10%', $settings['service_charge_label']);
        $this->assertSame('percent', $settings['service_charge_type']);
        $this->assertSame('10', $settings['service_charge_value']);
        $this->assertSame('1', $settings['service_charge_apply_dine_in']);
        $this->assertSame('0', $settings['service_charge_apply_takeaway']);
        $this->assertSame('0', $settings['service_charge_taxable']);
        // Still the order app's registry: website-only copy stays out.
        $this->assertArrayNotHasKey('cta_band_headline', $settings);
        $this->assertArrayHasKey('order_checkout_title', $settings);
    }

    public function test_the_order_app_content_carries_them_too_and_the_website_does_not(): void
    {
        $this->setServiceCharge(['service_charge_enabled' => '1', 'service_charge_value' => '12.5']);

        $orderApp = $this->getJson('/api/content?app=order_app&locale=en')->assertOk()->json('content');
        $this->assertSame('12.5', $orderApp['service_charge_value']);

        $dhivehi = $this->getJson('/api/content?app=order_app&locale=dv')->assertOk()->json('content');
        $this->assertSame('12.5', $dhivehi['service_charge_value']);

        $website = $this->getJson('/api/content?app=website&locale=en')->assertOk()->json('content');
        $this->assertArrayNotHasKey('service_charge_value', $website);
    }

    public function test_a_saved_change_shows_on_the_next_read(): void
    {
        $this->setServiceCharge(['service_charge_enabled' => '1', 'service_charge_value' => '10']);
        $this->assertSame('10', $this->getJson('/api/site-settings/public')->json('settings.service_charge_value'));

        $this->setServiceCharge(['service_charge_value' => '5', 'service_charge_enabled' => '0']);
        $settings = $this->getJson('/api/site-settings/public')->json('settings');
        $this->assertSame('5', $settings['service_charge_value']);
        $this->assertSame('0', $settings['service_charge_enabled']);
    }

    public function test_a_key_with_no_row_is_left_out_so_the_apps_keep_their_defaults(): void
    {
        SiteSetting::query()->whereIn('key', PublicOperationalSettings::KEYS)->delete();
        SiteSetting::bust();

        $settings = $this->getJson('/api/site-settings/public')->assertOk()->json('settings');
        foreach (PublicOperationalSettings::KEYS as $key) {
            $this->assertArrayNotHasKey($key, $settings, $key);
        }
    }

    public function test_the_list_is_the_keys_the_till_and_the_order_app_read_by_name(): void
    {
        $root = dirname(__DIR__, 3);
        $sources = [
            $root . '/packages/shared/src/utils/serviceCharge.ts',
            $root . '/apps/pos-web/src/api/settings.ts',
            $root . '/apps/online-order-web/src/hooks/useCheckout.ts',
        ];
        $text = '';
        foreach ($sources as $file) {
            $this->assertFileExists($file);
            $text .= file_get_contents($file);
        }
        foreach (PublicOperationalSettings::KEYS as $key) {
            $this->assertStringContainsString($key, $text, "No app reads {$key} from the public settings any more");
        }
    }
}
