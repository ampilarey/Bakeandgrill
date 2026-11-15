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

    /* Owner, 2026-11-15: "it says I owe to the shops. But I pay and bring items." */
    public function test_a_purchase_paid_in_full_in_cash_stays_paid_when_it_is_corrected(): void
    {
        $po = $this->order($this->agora, 'PO-1', 300);
        $po->forceFill(['paid_amount' => 300, 'payment_method' => 'cash', 'paid_at' => now()->toDateString()])->save();

        // A price put right afterwards: the shop was paid at the counter.
        $po->update(['subtotal' => 360, 'total' => 360]);
        $this->assertSame('paid', $po->fresh()->payment_status);
        $this->assertEquals(360.0, (float) $po->fresh()->paid_amount);

        $po->update(['subtotal' => 250, 'total' => 250]);
        $this->assertEquals(250.0, (float) $po->fresh()->paid_amount);
    }

    public function test_a_part_payment_and_an_exact_transfer_are_not_stretched(): void
    {
        $part = $this->order($this->agora, 'PO-1', 300);
        $part->forceFill(['paid_amount' => 100, 'payment_method' => 'cash'])->save();
        $part->update(['total' => 360]);
        $this->assertEquals(100.0, (float) $part->fresh()->paid_amount);
        $this->assertEquals(260.0, $part->fresh()->owed);

        $transfer = $this->order($this->fahi, 'PO-2', 300);
        $transfer->forceFill(['paid_amount' => 300, 'payment_method' => 'transfer'])->save();
        $transfer->update(['total' => 360]);
        $this->assertEquals(60.0, $transfer->fresh()->owed);
    }

    public function test_one_shop_or_every_shop_is_marked_paid_together(): void
    {
        $a1 = $this->order($this->agora, 'PO-1', 300, 'received', '9');
        $a2 = $this->order($this->agora, 'PO-2', 120);
        $a2->forceFill(['paid_amount' => 20, 'payment_method' => 'cash'])->save();
        $f1 = $this->order($this->fahi, 'PO-3', 80);
        $typed = $this->order(null, 'PO-4', 50, 'received', '5', 'Corner Shop');
        $draft = $this->order($this->agora, 'PO-5', 999, 'draft');
        Sanctum::actingAs($this->makeManager(), ['staff']);

        // Which shop must be said.
        $this->postJson('/api/purchasing/payables/settle', [])->assertStatus(422);

        $res = $this->postJson('/api/purchasing/payables/settle', ['supplier_id' => $this->agora->id])->assertOk();
        $this->assertSame(2, $res->json('settled'));
        $this->assertEquals(400.0, $res->json('total'));
        $this->assertSame('paid', $a1->fresh()->payment_status);
        // Dated the day it was bought, in cash, and marked as a batch.
        $this->assertSame($a1->purchase_date->toDateString(), $a1->fresh()->paid_at->toDateString());
        $this->assertSame('cash', $a1->fresh()->payment_method);
        $this->assertSame('Marked paid together', $a1->fresh()->payment_ref);
        $this->assertEquals(120.0, (float) $a2->fresh()->paid_amount);
        // Another shop's orders, and a draft, are untouched.
        $this->assertSame('unpaid', $f1->fresh()->payment_status);
        $this->assertEquals(0.0, (float) $draft->fresh()->paid_amount);

        // A shop with no supplier record goes by the name typed on the order.
        $this->postJson('/api/purchasing/payables/settle', ['name' => 'corner shop'])->assertOk()->assertJsonPath('settled', 1);
        $this->assertSame('paid', $typed->fresh()->payment_status);

        $this->postJson('/api/purchasing/payables/settle', ['all' => true])->assertOk()->assertJsonPath('settled', 1);
        $this->getJson('/api/purchasing/payables')->assertOk()->assertJsonPath('orders', 0)->assertJsonPath('total_owed', 0);
        $this->postJson('/api/purchasing/payables/settle', ['all' => true])->assertOk()->assertJsonPath('settled', 0);
    }

    public function test_marking_paid_together_needs_the_purchasing_permission(): void
    {
        $this->order($this->agora, 'PO-1', 300);
        Sanctum::actingAs($this->makeStaff(), ['staff']);

        $this->postJson('/api/purchasing/payables/settle', ['all' => true])->assertForbidden();
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
