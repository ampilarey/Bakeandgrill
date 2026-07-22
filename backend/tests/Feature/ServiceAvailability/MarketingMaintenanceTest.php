<?php

declare(strict_types=1);

namespace Tests\Feature\ServiceAvailability;

use App\Domains\System\Services\ServiceAvailabilityService;
use Database\Seeders\ServiceStateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * Stage 5 §7: when the `marketing_site` service_key is disabled, the public
 * marketing pages return HTTP 503 rendering the branded maintenance view.
 * Admin, order SPA, receipts, webhooks are unaffected (not asserted here —
 * those routes intentionally skip the `service.banner` middleware group).
 */
class MarketingMaintenanceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ServiceStateSeeder::class);
        Cache::flush();
    }

    public function test_home_page_returns_200_when_marketing_site_available(): void
    {
        $response = $this->get('/');
        $response->assertOk();
        $response->assertViewIs('home');
    }

    public function test_home_page_returns_503_maintenance_when_marketing_site_disabled(): void
    {
        app(ServiceAvailabilityService::class)->setState('marketing_site', [
            'status' => 'unavailable',
            'public_message' => 'Site refresh in progress.',
            'reason_type' => 'technical_maintenance',
        ]);

        $response = $this->get('/');

        $response->assertStatus(503);
        $response->assertViewIs('maintenance');
        $response->assertSee('Site refresh in progress.', false);
        $response->assertHeader('Retry-After');
    }

    public function test_contact_and_hours_also_render_maintenance_view(): void
    {
        app(ServiceAvailabilityService::class)->setState('marketing_site', [
            'status' => 'unavailable',
            'public_message' => 'Back soon.',
            'reason_type' => 'technical_maintenance',
        ]);

        $this->get('/contact')->assertStatus(503)->assertViewIs('maintenance');
        $this->get('/hours')->assertStatus(503)->assertViewIs('maintenance');
    }

    public function test_no_top_banner_when_a_public_service_is_down(): void
    {
        app(ServiceAvailabilityService::class)->setState('online_checkout', [
            'status' => 'unavailable',
            'public_message' => 'Checkout paused for updates.',
            'alternatives' => ['pickup', 'call'],
            'reason_type' => 'technical_maintenance',
        ]);

        $response = $this->get('/');

        $response->assertOk();
        // Top amber strip intentionally disabled — order-app hero / gates own this UX.
        $response->assertDontSee('Checkout paused for updates.', false);
        $response->assertDontSee('site-service-banner', false);
    }

    public function test_no_banner_shared_when_only_internal_services_are_down(): void
    {
        app(ServiceAvailabilityService::class)->setState('kds_operations', [
            'status' => 'unavailable',
            'public_message' => 'KDS lockdown.',
            'reason_type' => 'emergency',
        ]);

        $response = $this->get('/');
        $response->assertOk();
        $response->assertDontSee('KDS lockdown.', false);
    }
}
