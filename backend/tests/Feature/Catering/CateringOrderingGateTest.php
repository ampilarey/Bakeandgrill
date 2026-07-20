<?php

declare(strict_types=1);

namespace Tests\Feature\Catering;

use App\Models\Customer;
use App\Models\Item;
use App\Models\Permission;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\CateringOrderingGateService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CateringOrderingGateTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private Item $catalogItem;

    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();

        $this->customer = $this->makeCustomer([
            'phone' => '+9607770111',
            'name' => 'Gate Customer',
        ]);
        $this->catalogItem = Item::factory()->create([
            'name' => 'Gate Tray',
            'base_price' => 10.0,
            'is_active' => true,
            'has_variants' => false,
        ]);

        SiteSetting::set('catering_ordering_enabled', '1');
        SiteSetting::set('catering_ordering_schedule', null);
        SiteSetting::set('catering_ordering_override_until', null);
        SiteSetting::set('catering_min_lead_hours', '0');

        $managerRole = Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'description' => '', 'is_active' => true]);
        $perm = Permission::firstOrCreate(
            ['slug' => 'settings.update'],
            ['name' => 'Update settings', 'group' => 'settings'],
        );
        $managerRole->permissions()->syncWithoutDetaching([$perm->id]);

        $this->manager = User::create([
            'name' => 'Manager',
            'email' => 'manager-catering-gate@test.com',
            'password' => Hash::make('password'),
            'role_id' => $managerRole->id,
            'pin_hash' => Hash::make('5678'),
            'is_active' => true,
        ]);
    }

    public function test_status_endpoint_and_nested_preorder_on_ordering_status(): void
    {
        $this->getJson('/api/ordering/catering-status')
            ->assertOk()
            ->assertJsonPath('open', true)
            ->assertJsonPath('master_switch', true);

        $this->getJson('/api/ordering/status')
            ->assertOk()
            ->assertJsonPath('preorder.open', true);
    }

    public function test_master_switch_off_blocks_new_event_orders(): void
    {
        SiteSetting::set('catering_ordering_enabled', '0');
        SiteSetting::set(
            'catering_ordering_closed_message',
            'Pre-order paused for today.',
        );

        Sanctum::actingAs($this->customer, ['customer']);
        $this->postJson('/api/customer/event-orders', [
            'contact_name' => 'Aisha',
            'phone' => '7770111',
            'event_date' => now()->addDays(3)->toDateString(),
            'fulfillment_time' => '12:00',
            'fulfillment_method' => 'pickup',
            'lines' => [['item_id' => $this->catalogItem->id, 'quantity' => 1]],
        ])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'Pre-order paused for today.']);
    }

    public function test_schedule_and_override(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-20 10:00:00', config('app.timezone')));

        SiteSetting::set('catering_ordering_enabled', '1');
        SiteSetting::set('catering_ordering_schedule', json_encode([
            'mon' => ['enabled' => true, 'windows' => [['open' => '14:00', 'close' => '18:00']]],
        ]));

        $gate = app(CateringOrderingGateService::class);
        $this->assertFalse($gate->isOpen());

        SiteSetting::set('catering_ordering_override_until', now()->addHour()->toIso8601String());
        $this->assertTrue($gate->isOpen());

        Carbon::setTestNow();
    }

    public function test_admin_toggle_requires_settings_permission(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson('/api/admin/ordering/catering-toggle', ['enabled' => false])
            ->assertOk()
            ->assertJsonPath('catering_ordering_enabled', false)
            ->assertJsonPath('status.open', false);

        $this->postJson('/api/admin/ordering/catering-toggle', ['enabled' => true])
            ->assertOk()
            ->assertJsonPath('status.open', true);
    }
}
