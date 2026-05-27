<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Models\MenuGroup;
use App\Models\Role;
use App\Models\Shift;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PosBootstrapTest extends TestCase
{
    use RefreshDatabase;

    public function test_pos_bootstrap_returns_menu_and_current_shift_in_one_response(): void
    {
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Bootstrap Food', 'slug' => 'bootstrap-food', 'is_active' => true]);
        $item = Item::create([
            'category_id' => $category->id,
            'name' => 'Bootstrap Burger',
            'base_price' => 40.0,
            'sku' => 'BS-BRG',
            'is_active' => true,
            'is_available' => true,
        ]);
        ItemChannelAvailability::query()->updateOrCreate(
            ['item_id' => $item->id, 'channel' => 'dine_in'],
            ['is_enabled' => true],
        );

        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $staff = User::create([
            'name' => 'POS Bootstrap Cashier',
            'email' => 'pos-bootstrap@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        Shift::create([
            'user_id' => $staff->id,
            'opened_at' => now(),
            'opening_cash' => 500,
        ]);

        Sanctum::actingAs($staff, ['staff']);

        $response = $this->getJson('/api/pos/bootstrap?channel=dine_in')
            ->assertOk();

        $response->assertJsonPath('categories.0.name', 'Bootstrap Food');
        $response->assertJsonPath('items.0.name', 'Bootstrap Burger');
        $response->assertJsonPath('shift.opening_cash', '500.00');
        $response->assertJsonStructure([
            'categories' => [['id', 'name']],
            'items' => [['id', 'name', 'availability' => ['available']]],
            'shift' => ['id', 'opened_at', 'opening_cash'],
            'sms_notifications' => ['send_bill', 'send_pay_link', 'receipt_resend'],
        ]);
    }

    public function test_pos_bootstrap_reflects_disabled_sms_notification_toggles(): void
    {
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        SiteSetting::set('sms_pos_send_bill_enabled', 'false');
        SiteSetting::set('sms_pos_send_pay_link_enabled', 'false');

        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $staff = User::create([
            'name' => 'POS SMS Cashier',
            'email' => 'pos-sms-bootstrap@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        Sanctum::actingAs($staff, ['staff']);

        $this->getJson('/api/pos/bootstrap?channel=dine_in')
            ->assertOk()
            ->assertJsonPath('sms_notifications.send_bill', false)
            ->assertJsonPath('sms_notifications.send_pay_link', false)
            ->assertJsonPath('sms_notifications.receipt_resend', true);
    }
}
