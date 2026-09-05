<?php

declare(strict_types=1);

namespace Tests\Feature\PurchaseRequest;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Taking the delivery in.
 *
 * Owner, 2026-09-05: "when bought, there should be items to be delivered list.
 * When delivered both staffs can accept". So accepting moves off the manager's
 * desk and onto the floor, where the box actually arrives.
 *
 * Accepting is not a tick — it is what raises the stock and lands the cost. So
 * the person who bought a line cannot be the person who accepts it, the same
 * separation refunds and stock counts already have, with the same owner
 * exception for a one-person shift.
 */
class PurchaseRequestReceivingTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;

    private User $kitchen;

    private User $manager;

    private InventoryItem $flour;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->cashier = $this->makeStaff('staff', ['email' => 'cashier@recv.test']);
        $this->kitchen = $this->makeKitchenStaff(['email' => 'kitchen@recv.test']);
        $this->manager = $this->makeManager(['email' => 'manager@recv.test']);
        $this->flour = InventoryItem::create([
            'name' => 'Flour', 'unit' => 'kg', 'current_stock' => 10, 'unit_cost' => 5, 'is_active' => true,
        ]);
    }

    /** A line already bought, by whoever is named. */
    private function boughtLine(?User $buyer, array $overrides = []): PurchaseRequestItem
    {
        $pr = PurchaseRequest::create([
            'request_no' => 'PR-' . uniqid(),
            'source' => 'pos',
            'status' => 'bought_pending_verification',
            'priority' => 'normal',
            'requested_by' => $this->cashier->id,
        ]);

        return PurchaseRequestItem::create(array_merge([
            'purchase_request_id' => $pr->id,
            'inventory_item_id' => $this->flour->id,
            'requested_qty' => 5,
            'requested_unit' => 'kg',
            'actual_qty' => 5,
            'actual_unit' => 'kg',
            'actual_unit_cost_laar' => 600,
            'supplier_name_text' => 'Fahi Store',
            'status' => 'bought',
            'bought_at' => now(),
            'bought_by' => $buyer?->id,
        ], $overrides));
    }

    private function receive(PurchaseRequestItem $item): \Illuminate\Testing\TestResponse
    {
        return $this->postJson(
            "/api/purchase-requests/{$item->purchase_request_id}/items/{$item->id}/verify-received",
            [],
        );
    }

    public function test_the_list_shows_what_is_bought_and_not_yet_in_the_building(): void
    {
        $this->boughtLine($this->manager);

        Sanctum::actingAs($this->cashier, ['staff']);
        $row = $this->getJson('/api/purchase-requests/to-receive')->assertOk()->json('items.0');

        // What the person at the back door is looking at: a box, from a shop.
        $this->assertSame('Flour', $row['name']);
        $this->assertEquals(5, $row['qty']);
        $this->assertSame('kg', $row['unit']);
        $this->assertSame('Fahi Store', $row['shop']);
        $this->assertTrue($row['can_receive']);
    }

    public function test_a_cashier_can_accept_a_delivery_and_the_stock_goes_up(): void
    {
        // Accepting is what puts it on the shelf — the point of the screen.
        $item = $this->boughtLine($this->manager);

        Sanctum::actingAs($this->cashier, ['staff']);
        $this->receive($item)->assertOk();

        $this->assertSame('received', $item->fresh()->status);
        $this->assertEquals(15, (float) $this->flour->fresh()->current_stock);
    }

    public function test_kitchen_staff_can_accept_one_too(): void
    {
        // The other half of the owner's ask: the cook at the back door.
        $item = $this->boughtLine($this->manager);

        Sanctum::actingAs($this->kitchen, ['staff']);
        $this->receive($item)->assertOk();

        $this->assertSame('received', $item->fresh()->status);
    }

    public function test_the_person_who_bought_it_cannot_accept_it(): void
    {
        /*
         * The whole control. One person on both ends means buy four crates,
         * accept six, and nothing in the system disagrees.
         */
        $item = $this->boughtLine($this->cashier);

        Sanctum::actingAs($this->cashier, ['staff']);
        $this->receive($item)->assertStatus(422)->assertJsonValidationErrors(['receive']);

        $this->assertSame('bought', $item->fresh()->status);
        $this->assertEquals(10, (float) $this->flour->fresh()->current_stock);
    }

    public function test_the_list_says_who_is_blocked_and_why_before_they_tap(): void
    {
        // Greyed with a reason beats a button that fails on press.
        $item = $this->boughtLine($this->cashier);

        Sanctum::actingAs($this->cashier, ['staff']);
        $row = $this->getJson('/api/purchase-requests/to-receive')->assertOk()->json('items.0');

        $this->assertFalse($row['can_receive']);
        $this->assertStringContainsString('somebody else', (string) $row['blocked_reason']);
        $this->assertSame($item->id, $row['id']);
    }

    public function test_an_owner_alone_on_a_shift_can_accept_their_own_purchase(): void
    {
        // Same exception the refund and stock-count rules carry: with nobody
        // else on, blocking would only mean the delivery never gets entered.
        $owner = $this->makeOwner(['email' => 'owner@recv.test']);
        $item = $this->boughtLine($owner);

        Sanctum::actingAs($owner, ['staff']);
        $this->receive($item)->assertOk();

        $this->assertSame('received', $item->fresh()->status);
    }

    public function test_a_line_bought_before_the_buyer_was_recorded_still_goes_through(): void
    {
        // Rows that predate `bought_by` have no name to compare. Refusing on a
        // fact nobody captured would strand deliveries already in flight.
        $item = $this->boughtLine(null);

        Sanctum::actingAs($this->cashier, ['staff']);
        $this->receive($item)->assertOk();

        $this->assertSame('received', $item->fresh()->status);
    }

    public function test_buying_records_who_did_it(): void
    {
        /*
         * The rule above needs a name, and the assignee is the wrong one:
         * anyone with view_all can mark a line bought without being assigned.
         */
        $pr = PurchaseRequest::create([
            'request_no' => 'PR-' . uniqid(),
            'source' => 'pos', 'status' => 'assigned', 'priority' => 'normal',
            'requested_by' => $this->cashier->id,
            'assigned_to' => $this->cashier->id,
        ]);
        $line = PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'inventory_item_id' => $this->flour->id,
            'requested_qty' => 3, 'requested_unit' => 'kg', 'status' => 'approved',
        ]);

        // The manager buys it, though the cashier is the assignee.
        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/purchase-requests/{$pr->id}/items/{$line->id}/mark-bought", [
            'actual_qty' => 3,
            'actual_unit_cost_laar' => 500,
            'supplier_name_text' => 'Agora',
        ])->assertOk();

        $this->assertSame($this->manager->id, (int) $line->fresh()->bought_by);
    }

    public function test_someone_without_the_permission_cannot_see_or_accept(): void
    {
        $item = $this->boughtLine($this->manager);

        Sanctum::actingAs($this->makeStaff('greeter'), ['staff']);
        $this->getJson('/api/purchase-requests/to-receive')->assertForbidden();
        $this->receive($item)->assertForbidden();
    }
}
