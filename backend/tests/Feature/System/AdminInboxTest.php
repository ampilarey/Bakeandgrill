<?php

declare(strict_types=1);

namespace Tests\Feature\System;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\System\AdminInbox;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemQuestion;
use App\Models\Order;
use App\Models\Review;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Needs attention (iruali import plan, feature 14). */
class AdminInboxTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $customer = Customer::factory()->create();
        $order = Order::factory()->create(['customer_id' => $customer->id, 'status' => 'completed']);
        Review::create(['customer_id' => $customer->id, 'order_id' => $order->id, 'rating' => 3, 'type' => 'order', 'status' => 'pending']);
        ItemQuestion::create(['item_id' => Item::factory()->create()->id, 'question' => 'Spicy?', 'status' => 'pending']);
    }

    public function test_the_owner_sees_the_waiting_rows_with_links(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $rows = collect($this->getJson('/api/admin/inbox')->assertOk()->assertJsonPath('total', 2)->json('rows'))->keyBy('key');
        $this->assertSame('/customers/reviews', $rows['reviews']['link']);
        $this->assertSame(1, $rows['questions']['count']);
        $this->assertArrayNotHasKey('refunds_approval', $rows->all(), 'nothing waiting, no row');
    }

    public function test_a_cashier_only_sees_rows_for_pages_they_can_open(): void
    {
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        PermissionCatalogSync::sync();
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id, 'is_active' => true]), ['staff']);
        $keys = collect($this->getJson('/api/admin/inbox')->assertOk()->json('rows'))->pluck('key')->all();
        $this->assertNotContains('reviews', $keys);
        $this->assertNotContains('questions', $keys);
    }

    public function test_a_row_that_throws_is_skipped(): void
    {
        AdminInbox::register('broken', ['label' => 'Broken', 'link' => '/', 'permission' => 'customers.manage', 'count' => fn () => throw new \RuntimeException('nope')]);
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->getJson('/api/admin/inbox')->assertOk()->assertJsonPath('total', 2);
    }
}
