<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Purchase;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-23: "when manual po is enter and items received, why i see i
 * owe to that shop?" The manual PO now says what was paid at the counter, so
 * a shop paid on the spot is not shown as owed once the goods are in.
 */
class ManualPurchasePaidNowTest extends TestCase
{
    use RefreshDatabase;

    private InventoryItem $flour;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->flour = InventoryItem::create(['name' => 'Flour', 'unit' => 'kg', 'unit_cost' => 10, 'is_active' => true]);
        Sanctum::actingAs($this->makeManager(), ['staff']);
    }

    private function create(array $extra, string $status = 'received'): Purchase
    {
        $res = $this->postJson('/api/purchases', array_merge([
            'supplier_name_text' => 'Fahi Store',
            'purchase_date' => now()->toDateString(),
            'status' => $status,
            'items' => [['inventory_item_id' => $this->flour->id, 'quantity' => 10, 'unit_cost' => 10]],
        ], $extra))->assertCreated();

        return Purchase::findOrFail($res->json('purchase.id'));
    }

    public function test_paid_in_full_at_the_counter_owes_nothing_once_received(): void
    {
        $po = $this->create(['paid' => 'full', 'paid_method' => 'transfer']);

        $this->assertEquals(100, $po->paid_amount);
        $this->assertSame('transfer', $po->payment_method);
        $this->assertSame(now()->toDateString(), $po->paid_at?->toDateString());
        $this->assertEquals(0, $po->owed);
        $this->assertSame('paid', $po->payment_status);
    }

    public function test_paid_part_owes_the_rest_and_never_more_than_the_total_is_paid(): void
    {
        $part = $this->create(['paid' => 'part', 'paid_amount' => 40]);
        $this->assertEquals(60, $part->owed);
        $this->assertSame('partial', $part->payment_status);
        $this->assertSame('cash', $part->payment_method);

        $over = $this->create(['paid' => 'part', 'paid_amount' => 500]);
        $this->assertEquals(100, $over->paid_amount);
        $this->assertEquals(0, $over->owed);

        $this->postJson('/api/purchases', [
            'supplier_name_text' => 'Fahi Store',
            'purchase_date' => now()->toDateString(),
            'paid' => 'part',
            'items' => [['inventory_item_id' => $this->flour->id, 'quantity' => 1, 'unit_cost' => 10]],
        ])->assertStatus(422)->assertJsonValidationErrors('paid_amount');
    }

    public function test_not_paid_yet_or_nothing_said_is_owed_as_before(): void
    {
        $this->assertEquals(100, $this->create(['paid' => 'none'])->owed);
        $this->assertEquals(100, $this->create([])->owed);
    }

    public function test_a_draft_keeps_the_payment_for_when_it_is_received(): void
    {
        $draft = $this->create(['paid' => 'full'], 'draft');
        $this->assertEquals(100, $draft->paid_amount);

        $draft->update(['status' => 'received']);
        $this->assertEquals(0, $draft->fresh()->owed);
    }
}
