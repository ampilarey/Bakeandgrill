<?php

declare(strict_types=1);

namespace Tests\Feature\ServiceAvailability;

use App\Domains\System\Services\ServiceAvailabilityService;
use Database\Seeders\ServiceStateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class PublicStatusEndpointTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ServiceStateSeeder::class);
        Cache::flush();
    }

    public function test_service_status_endpoint_returns_all_keys(): void
    {
        $response = $this->getJson('/api/service-status');

        $response->assertOk();
        $response->assertJsonStructure([
            'services' => [
                'online_checkout' => [
                    'service_key',
                    'group',
                    'available',
                    'status',
                    'reason_type',
                    'public_message',
                    'alternatives',
                    'retry_at',
                    'notify_enabled',
                    'incident_id',
                ],
                'online_delivery',
                'online_pickup',
                'catering_inquiry',
                'customer_registration',
                'marketing_site',
                'pos_sales',
                'emergency_write_lock',
            ],
            'generated_at',
        ]);
        $response->assertJsonPath('services.online_checkout.available', true);
    }

    public function test_service_status_reflects_disabled_state(): void
    {
        $user = $this->makeOwner();
        app(ServiceAvailabilityService::class)->setState('online_checkout', [
            'status' => 'unavailable',
            'public_message' => 'Under maintenance',
            'alternatives' => ['pickup', 'call'],
            'reason_type' => 'technical_maintenance',
        ], actor: $user);

        $response = $this->getJson('/api/service-status');
        $response->assertOk();
        $response->assertJsonPath('services.online_checkout.available', false);
        $response->assertJsonPath('services.online_checkout.public_message', 'Under maintenance');
        $response->assertJsonPath('services.online_checkout.alternatives', ['pickup', 'call']);
    }

    public function test_ordering_status_includes_additive_services_map(): void
    {
        $response = $this->getJson('/api/ordering/status');

        $response->assertOk();
        // Existing keys preserved.
        $response->assertJsonStructure([
            'open',
            'message',
            'reason',
            'master_switch',
            'delivery_available',
            'services' => ['online_checkout', 'online_payment'],
        ]);
        $response->assertJsonPath('services.online_checkout.available', true);
    }
}
