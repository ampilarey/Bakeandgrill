<?php

declare(strict_types=1);

namespace Tests\Feature\ServiceAvailability;

use App\Models\RestorationSubscription;
use Database\Seeders\ServiceStateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PruneRestorationSubscriptionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ServiceStateSeeder::class);
    }

    public function test_prune_anonymises_terminal_rows_past_retention(): void
    {
        // Old notified — should be anonymised
        $old = RestorationSubscription::query()->create([
            'service_key' => 'online_checkout',
            'service_incident_id' => null,
            'normalized_mobile' => '+9607777777',
            'status' => 'notified',
            'consent_text_version' => 'v1',
            'requested_at' => now()->subDays(60),
            'notified_at' => now()->subDays(45),
            'request_ip_hash' => str_repeat('a', 64),
        ]);

        // Recent notified — should be kept intact
        $recent = RestorationSubscription::query()->create([
            'service_key' => 'online_checkout',
            'service_incident_id' => null,
            'normalized_mobile' => '+9607777778',
            'status' => 'notified',
            'consent_text_version' => 'v1',
            'requested_at' => now()->subDays(1),
            'notified_at' => now()->subHours(2),
            'request_ip_hash' => str_repeat('b', 64),
        ]);

        // Pending — never anonymised
        $pending = RestorationSubscription::query()->create([
            'service_key' => 'online_checkout',
            'service_incident_id' => null,
            'normalized_mobile' => '+9607777779',
            'status' => 'pending',
            'consent_text_version' => 'v1',
            'requested_at' => now()->subDays(90),
            'request_ip_hash' => str_repeat('c', 64),
        ]);

        $this->artisan('service-availability:prune-restoration-subscriptions')->assertSuccessful();

        $this->assertSame('', $old->fresh()->normalized_mobile);
        $this->assertNull($old->fresh()->request_ip_hash);
        $this->assertSame('+9607777778', $recent->fresh()->normalized_mobile);
        $this->assertSame('+9607777779', $pending->fresh()->normalized_mobile);
    }

    public function test_prune_is_idempotent_on_already_anonymised_rows(): void
    {
        RestorationSubscription::query()->create([
            'service_key' => 'online_checkout',
            'service_incident_id' => null,
            'normalized_mobile' => '',
            'status' => 'notified',
            'consent_text_version' => 'v1',
            'requested_at' => now()->subDays(60),
            'notified_at' => now()->subDays(45),
            'request_ip_hash' => null,
        ]);

        $this->artisan('service-availability:prune-restoration-subscriptions')
            ->assertSuccessful()
            ->expectsOutputToContain('Anonymised 0');
    }
}
