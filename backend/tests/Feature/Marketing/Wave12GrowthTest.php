<?php

declare(strict_types=1);

namespace Tests\Feature\Marketing;

use App\Models\Customer;
use App\Models\DeliveryDriver;
use App\Models\Item;
use App\Models\ItemPairStat;
use App\Models\Order;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class Wave12GrowthTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_session_issues_customer_token(): void
    {
        $this->postJson('/api/auth/customer/guest-session', [
            'phone' => '7912345',
            'name' => 'Guest User',
        ])
            ->assertOk()
            ->assertJsonStructure(['token', 'customer' => ['phone', 'name']]);

        $this->assertDatabaseHas('customers', [
            'phone' => '+9607912345',
            'name' => 'Guest User',
        ]);
    }

    public function test_pickup_slots_endpoint(): void
    {
        SiteSetting::set('pickup_slots_enabled', '1');

        $this->getJson('/api/ordering/pickup-slots')
            ->assertOk()
            ->assertJsonStructure(['date', 'slots']);
    }

    public function test_customer_cohorts_report(): void
    {
        $owner = $this->makeOwner();
        $customer = Customer::factory()->create();

        Order::factory()->create([
            'customer_id' => $customer->id,
            'status' => 'completed',
            'payment_status' => 'paid',
            'created_at' => now()->subDays(10),
        ]);
        Order::factory()->create([
            'customer_id' => $customer->id,
            'status' => 'completed',
            'payment_status' => 'paid',
            'created_at' => now()->subDays(5),
        ]);

        $from = now()->subMonths(2)->toDateString();
        $to = now()->toDateString();

        $this->actingAs($owner)
            ->getJson("/api/reports/customer-cohorts?from={$from}&to={$to}")
            ->assertOk()
            ->assertJsonStructure(['from', 'to', 'cohorts']);
    }

    public function test_admin_item_pairs_list(): void
    {
        $owner = $this->makeOwner();
        $a = Item::factory()->create(['name' => 'Coffee']);
        $b = Item::factory()->create(['name' => 'Croissant']);

        ItemPairStat::create([
            'item_id' => $a->id,
            'paired_item_id' => $b->id,
            'pair_count' => 12,
            'computed_at' => now(),
        ]);

        $this->actingAs($owner)
            ->getJson('/api/admin/marketing/item-pairs')
            ->assertOk()
            ->assertJsonPath('data.0.item_name', 'Coffee')
            ->assertJsonPath('data.0.paired_item_name', 'Croissant')
            ->assertJsonPath('data.0.pair_count', 12);
    }

    public function test_driver_can_upload_proof_of_delivery(): void
    {
        Storage::fake('public');

        $driver = DeliveryDriver::create([
            'name' => 'Driver One',
            'phone' => '7999888',
            'pin' => bcrypt('1234'),
            'is_active' => true,
        ]);

        $order = Order::factory()->create([
            'type' => 'delivery',
            'status' => 'on_the_way',
            'delivery_driver_id' => $driver->id,
        ]);

        $token = $driver->createToken('driver-test', ['driver'])->plainTextToken;

        $this->withToken($token)
            ->postJson("/api/driver/deliveries/{$order->id}/proof", [
                'photo' => UploadedFile::fake()->image('proof.jpg'),
            ])
            ->assertOk()
            ->assertJsonStructure(['proof_url']);

        $order->refresh();
        $this->assertNotNull($order->proof_of_delivery_path);
    }
}
