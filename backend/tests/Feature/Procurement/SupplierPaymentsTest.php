<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-21: close the buying loop — what do we owe, and to whom.
 */
class SupplierPaymentsTest extends TestCase
{
    use RefreshDatabase;

    private Supplier $agora;

    private Supplier $fahi;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->agora = Supplier::create(['name' => 'Agora']);
        $this->fahi = Supplier::create(['name' => 'Fahi Store']);
    }

    private function order(?Supplier $s, string $number, float $total, string $status = 'received', string $daysAgo = '5', ?string $typed = null): Purchase
    {
        $item = InventoryItem::firstOrCreate(['name' => 'Flour'], ['unit' => 'kg', 'unit_cost' => 10, 'is_active' => true]);
        $po = Purchase::create([
            'purchase_number' => $number,
            'supplier_id' => $s?->id,
            'supplier_name_text' => $typed,
            'purchase_date' => now()->subDays((int) $daysAgo)->toDateString(),
            'status' => $status,
            'subtotal' => $total,
            'total' => $total,
        ]);
        PurchaseItem::create(['purchase_id' => $po->id, 'inventory_item_id' => $item->id, 'quantity' => 1, 'unit_cost' => $total, 'total_cost' => $total]);

        return $po;
    }

    public function test_a_payment_is_recorded_part_by_part_until_the_order_is_paid(): void
    {
        $po = $this->order($this->agora, 'PO-1', 300);
        Sanctum::actingAs($this->makeManager(), ['staff']);

        $res = $this->postJson("/api/purchases/{$po->id}/payment", ['amount' => 100, 'paid_on' => '2026-09-20', 'method' => 'cash'])->assertOk();
        $this->assertSame('partial', $res->json('purchase.payment_status'));
        $this->assertEquals(200, $res->json('purchase.owed'));
        $this->assertStringContainsString('200.00 still owed', $res->json('message'));

        // No amount means the rest of it.
        $res = $this->postJson("/api/purchases/{$po->id}/payment", ['method' => 'transfer', 'reference' => 'BML 4432'])->assertOk();
        $this->assertSame('paid', $res->json('purchase.payment_status'));
        $this->assertEquals(0, $res->json('purchase.owed'));
        $this->assertSame('Marked as paid.', $res->json('message'));
        $this->assertSame('BML 4432', $po->fresh()->payment_ref);
        $this->assertEquals(300, $po->fresh()->paid_amount);

        $this->postJson("/api/purchases/{$po->id}/payment", ['amount' => 1])->assertStatus(422);
    }

    public function test_more_than_is_owed_is_refused_and_a_draft_has_nothing_to_pay(): void
    {
        $po = $this->order($this->agora, 'PO-1', 300);
        $draft = $this->order($this->agora, 'PO-2', 50, 'draft');
        Sanctum::actingAs($this->makeManager(), ['staff']);

        $this->postJson("/api/purchases/{$po->id}/payment", ['amount' => 300.50])->assertStatus(422)
            ->assertJsonPath('errors.amount.0', 'That is more than the MVR 300.00 still owed.');
        $this->postJson("/api/purchases/{$draft->id}/payment", ['amount' => 10])->assertStatus(422);
        $this->assertSame('none', $draft->fresh()->payment_status);
    }

    public function test_a_payment_can_be_cleared(): void
    {
        $po = $this->order($this->agora, 'PO-1', 300);
        Sanctum::actingAs($this->makeManager(), ['staff']);
        $this->postJson("/api/purchases/{$po->id}/payment")->assertOk();

        $this->deleteJson("/api/purchases/{$po->id}/payment")->assertOk()->assertJsonPath('purchase.payment_status', 'unpaid');
        $this->assertEquals(0, $po->fresh()->paid_amount);
        $this->assertNull($po->fresh()->paid_at);
    }

    public function test_payables_add_up_what_is_owed_per_shop_oldest_first_within_each(): void
    {
        $this->order($this->agora, 'PO-1', 300, 'received', '40');
        $this->order($this->agora, 'PO-2', 120, 'ordered', '3');
        $paid = $this->order($this->agora, 'PO-3', 500, 'received', '10');
        $paid->forceFill(['paid_amount' => 500, 'paid_at' => now()->toDateString()])->save();
        $this->order($this->fahi, 'PO-4', 80, 'partial', '7');
        $this->order($this->fahi, 'PO-5', 999, 'cancelled', '2');
        $this->order($this->agora, 'PO-6', 999, 'draft', '1');
        $this->order(null, 'PO-7', 45, 'received', '2', 'Corner shop');

        Sanctum::actingAs($this->makeManager(), ['staff']);
        $res = $this->getJson('/api/purchasing/payables')->assertOk();

        $this->assertEquals(545, $res->json('total_owed'));
        $this->assertSame(4, $res->json('orders'));
        $rows = $res->json('suppliers');
        $this->assertSame(['Agora', 'Fahi Store', 'Corner shop'], array_column($rows, 'name'));
        $this->assertEquals(420, $rows[0]['owed']);
        $this->assertSame(2, $rows[0]['orders']);
        $this->assertSame(now()->subDays(40)->toDateString(), $rows[0]['oldest_date']);
        $this->assertSame('PO-1', $rows[0]['oldest_number']);
        $this->assertNull($rows[2]['supplier_id']);

        // The supplier page carries the same number.
        $ov = $this->getJson("/api/purchasing/suppliers/{$this->agora->id}/overview")->assertOk();
        $this->assertEquals(420, $ov->json('owed.amount'));
        $this->assertSame(2, $ov->json('owed.orders'));
    }

    public function test_kitchen_staff_may_not_pay_or_look(): void
    {
        $po = $this->order($this->agora, 'PO-1', 300);
        Sanctum::actingAs($this->makeKitchenStaff(), ['staff']);
        $this->postJson("/api/purchases/{$po->id}/payment")->assertForbidden();
        $this->getJson('/api/purchasing/payables')->assertForbidden();
    }
}
