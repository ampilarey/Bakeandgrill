<?php

declare(strict_types=1);

namespace Tests\Feature\Pos;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Order;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-15: a takeaway the cashier rang up and sent as an invoice
 * or pay link, which the customer paid online, stays in the till's Active
 * orders until the till marks it Collected. A takeaway paid at the till
 * still leaves the list as soon as it is paid.
 */
class PaidOnlineTakeawayTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->cashier = $this->makeOwner(['name' => 'Cashier']);
        Sanctum::actingAs($this->cashier, ['staff']);
    }

    private function takeaway(string $method, string $paymentStatus = 'paid'): Order
    {
        $order = Order::factory()->create([
            'type' => 'takeaway', 'status' => 'paid', 'payment_status' => $paymentStatus, 'user_id' => $this->cashier->id,
            'subtotal' => 50, 'tax_amount' => 0, 'total' => 50, 'customer_id' => null,
        ]);
        Payment::create(['order_id' => $order->id, 'method' => $method, 'amount' => 50, 'amount_laar' => 5000, 'status' => 'paid']);

        return $order;
    }

    /** @return list<int> */
    private function active(): array
    {
        return collect($this->getJson('/api/orders?active_only=1&slim=1')->assertOk()->json('data'))->pluck('id')->all();
    }

    public function test_a_takeaway_paid_online_stays_until_collected_and_one_paid_at_the_till_leaves_when_paid(): void
    {
        $online = $this->takeaway('bml_connect');
        $till = $this->takeaway('cash');

        $this->assertContains($online->id, $this->active(), 'paid by pay link or invoice: stays for Collected');
        $this->assertNotContains($till->id, $this->active(), 'paid at the till: the sale is done');

        // The till walks it through as it does a pickup: Start cooking, Mark ready, Collected.
        $this->postJson("/api/orders/{$online->id}/start-cooking")->assertOk();
        $this->postJson("/api/orders/{$online->id}/mark-ready")->assertOk();
        $this->assertContains($online->id, $this->active());
        $this->postJson("/api/orders/{$online->id}/mark-picked-up")->assertOk();
        $this->assertSame('completed', $online->fresh()->status);
        $this->assertNotContains($online->id, $this->active(), 'collected: gone from Active orders');
    }
}
