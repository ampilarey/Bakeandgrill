<?php

declare(strict_types=1);

namespace Tests\Feature\ServiceAvailability;

use App\Domains\System\Services\ServiceAvailabilityService;
use App\Exceptions\ServiceUnavailableException;
use App\Models\ServiceIncident;
use App\Models\ServiceState;
use App\Models\SiteSetting;
use Database\Seeders\ServiceStateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class ServiceAvailabilityResolverTest extends TestCase
{
    use RefreshDatabase;

    private ServiceAvailabilityService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ServiceStateSeeder::class);
        $this->service = app(ServiceAvailabilityService::class);
        Cache::flush();
    }

    public function test_seeder_leaves_every_configured_key_available(): void
    {
        $keys = array_keys(config('service_availability.keys'));

        foreach ($keys as $key) {
            $this->assertTrue(
                $this->service->isAvailable($key),
                "Seeded key {$key} should be available",
            );
        }

        $this->assertGreaterThanOrEqual(12, ServiceState::query()->count());
    }

    public function test_snapshot_contains_all_keys_with_default_available(): void
    {
        $snapshot = $this->service->resolve();
        $this->assertArrayHasKey('online_checkout', $snapshot);
        $this->assertTrue($snapshot['online_checkout']['available']);
        $this->assertSame('available', $snapshot['online_checkout']['status']);
    }

    public function test_set_state_disables_and_opens_incident_and_audits(): void
    {
        $user = $this->makeOwner();

        $state = $this->service->setState('online_checkout', [
            'status' => 'unavailable',
            'reason_type' => 'technical_maintenance',
            'public_message' => 'Under maintenance',
            'alternatives' => ['call'],
        ], actor: $user);

        $this->assertSame('unavailable', $state->status);
        $this->assertNotNull($state->current_incident_id);

        $incident = ServiceIncident::query()->find($state->current_incident_id);
        $this->assertSame('open', $incident->status);
        $this->assertSame($user->id, $incident->created_by);

        $this->assertFalse($this->service->isAvailable('online_checkout'));

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'service_availability.state_changed',
            'user_id' => $user->id,
        ]);
    }

    public function test_set_state_bust_cache_immediately_reflects_change(): void
    {
        // Warm the cache while all-available.
        $this->assertTrue($this->service->isAvailable('online_payment'));

        $user = $this->makeOwner();
        $this->service->setState('online_payment', ['status' => 'unavailable'], actor: $user);

        $this->assertFalse($this->service->isAvailable('online_payment'));
    }

    public function test_restore_closes_open_incident(): void
    {
        $user = $this->makeOwner();

        $this->service->setState('online_payment', [
            'status' => 'unavailable',
        ], actor: $user);
        $state = ServiceState::query()->where('service_key', 'online_payment')->first();
        $this->assertNotNull($state->current_incident_id);
        $openId = $state->current_incident_id;

        $this->service->setState('online_payment', [
            'status' => 'available',
        ], actor: $user);

        $incident = ServiceIncident::query()->find($openId);
        $this->assertSame('restored', $incident->status);
        $this->assertNotNull($incident->restored_at);
        $this->assertSame($user->id, $incident->restored_by);

        $state = ServiceState::query()->where('service_key', 'online_payment')->first();
        $this->assertNull($state->current_incident_id);
    }

    public function test_env_public_transactions_disabled_forces_public_keys_down(): void
    {
        config()->set('service_availability.public_transactions_disabled', true);
        $this->service->bustCache();

        $snapshot = $this->service->resolve();

        $this->assertFalse($snapshot['online_checkout']['available']);
        $this->assertFalse($snapshot['online_payment']['available']);
        $this->assertSame('env', $snapshot['online_checkout']['source']);
        // Marketing site stays up.
        $this->assertTrue($snapshot['marketing_site']['available']);
        // Internal services untouched.
        $this->assertTrue($snapshot['pos_sales']['available']);
    }

    public function test_env_emergency_write_lock_disables_internal_and_public(): void
    {
        config()->set('service_availability.emergency_write_lock', true);
        $this->service->bustCache();

        $snapshot = $this->service->resolve();

        $this->assertFalse($snapshot['pos_sales']['available']);
        $this->assertFalse($snapshot['online_checkout']['available']);
        $this->assertSame('emergency_disabled', $snapshot['pos_sales']['status']);
    }

    public function test_assert_available_throws_on_disabled(): void
    {
        $user = $this->makeOwner();
        $this->service->setState('online_checkout', ['status' => 'unavailable'], actor: $user);

        $this->expectException(ServiceUnavailableException::class);
        $this->service->assertAvailable('online_checkout');
    }

    public function test_assert_available_no_op_when_enforcement_disabled(): void
    {
        $user = $this->makeOwner();
        $this->service->setState('online_checkout', ['status' => 'unavailable'], actor: $user);

        config()->set('service_availability.enforcement_enabled', false);
        $this->service->bustCache();

        $this->service->assertAvailable('online_checkout');
        $this->addToAssertionCount(1); // no exception
    }

    public function test_online_pickup_reflects_legacy_online_gate_when_overlay_available(): void
    {
        // Turn off legacy online ordering master switch.
        SiteSetting::updateOrCreate(['key' => 'online_ordering_enabled'], [
            'value' => '0',
            'type' => 'boolean',
            'group' => 'Online Ordering',
            'label' => 'Online Ordering',
            'is_public' => true,
        ]);
        Cache::forget('site_setting.online_ordering_enabled');
        $this->service->bustCache();

        // online_pickup overlay row is still available, but legacy gate is closed.
        $snapshot = $this->service->resolve();
        $this->assertFalse($snapshot['online_pickup']['available']);
        $this->assertSame('legacy_gate', $snapshot['online_pickup']['source']);

        // online_checkout has no adapter — still available.
        $this->assertTrue($snapshot['online_checkout']['available']);
    }

    public function test_apply_preset_pauses_all_online_ordering_keys(): void
    {
        $user = $this->makeOwner();
        $this->service->applyPreset('pause_all_online_ordering', actor: $user);

        $snapshot = $this->service->resolve();
        $this->assertFalse($snapshot['online_checkout']['available']);
        $this->assertFalse($snapshot['online_pickup']['available']);
        $this->assertFalse($snapshot['online_delivery']['available']);
    }

    public function test_state_returns_default_for_unknown_key(): void
    {
        $state = $this->service->state('made_up_key');
        $this->assertTrue($state['available']);
        $this->assertSame('unknown_key_default', $state['source']);
    }
}
