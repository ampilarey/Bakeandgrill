<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Domains\Inventory\Bills\BillNames;
use App\Domains\Inventory\Bills\BillReader;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\PurchaseBill;
use App\Models\PurchaseItem;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-11-15: "one shop may have 2-3 branches so invoice will be in different
 * shops name. But actually it's one shop. Some items also like that. And how do you
 * deal with brands?"
 */
class BillNamesTest extends TestCase
{
    use RefreshDatabase;

    private InventoryItem $butter;

    private Supplier $agora;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->butter = InventoryItem::create(['name' => 'Butter', 'unit' => 'kg', 'unit_cost' => 90, 'is_active' => true]);
        $this->agora = Supplier::create(['name' => 'Agora']);
    }

    private function raw(array $over = []): array
    {
        return array_merge([
            'is_bill' => true, 'shop' => 'AGORA HULHUMALE BRANCH', 'bill_no' => 'H-1', 'date' => now()->subDay()->toDateString(),
            'total' => 180, 'gst_total' => 0, 'note' => '',
            'lines' => [['name' => 'ANCHOR UNSALTED BTR 1KG', 'item_id' => 0, 'brand' => 'Anchor', 'new_name' => 'Unsalted butter', 'new_unit' => 'kg', 'quantity' => 2, 'unit' => '', 'pack_size' => 0, 'unit_price' => 90, 'amount' => 180, 'gst' => false, 'unsure' => false]],
        ], $over);
    }

    public function test_wordings_fold_to_one_key(): void
    {
        $this->assertSame(BillNames::key('C/COLA 500ML  PET.'), BillNames::key('c cola 500ml pet'));
        $this->assertNotSame(BillNames::key('Cola 500ml'), BillNames::key('Cola 1.5L'));
    }

    public function test_a_bill_saved_under_another_shop_and_item_teaches_both_for_the_next_one(): void
    {
        $reader = app(BillReader::class);
        // First time: nobody knows the branch or the wording.
        $first = $reader->tidy($this->raw());
        $this->assertSame('AGORA HULHUMALE BRANCH', $first['shop']);
        $this->assertNull($first['lines'][0]['item_id']);
        $this->assertSame('Anchor', $first['lines'][0]['brand']);

        $bill = PurchaseBill::create(['file_path' => 'x.jpg', 'file_name' => 'x.jpg', 'mime_type' => 'image/jpeg', 'file_hash' => sha1('x'), 'status' => 'ready', 'data' => $first]);
        Sanctum::actingAs($this->makeManager(), ['staff']);
        // The person picks the supplier on file and the Butter item for that line.
        $this->postJson('/api/purchases', [
            'supplier_name_text' => 'Agora', 'purchase_date' => now()->subDay()->toDateString(), 'bill_id' => $bill->id, 'paid' => 'full', 'paid_method' => 'cash',
            'items' => [['inventory_item_id' => $this->butter->id, 'name' => 'Butter', 'quantity' => 2, 'unit_cost' => 90, 'gst_rate_bp' => 0, 'brand' => 'Anchor', 'bill_name' => 'ANCHOR UNSALTED BTR 1KG']],
        ])->assertCreated();

        // The brand is kept on the line, the item stays one Butter.
        $this->assertSame('Anchor', PurchaseItem::firstOrFail()->brand);
        $this->assertSame(1, InventoryItem::count());

        // The next bill from that branch, the wording spaced differently and guessed wrong.
        $other = InventoryItem::create(['name' => 'Margarine', 'unit' => 'kg', 'unit_cost' => 40, 'is_active' => true]);
        $raw = $this->raw(['shop' => 'Agora  Hulhumale branch']);
        $raw['lines'][0]['name'] = 'Anchor Unsalted BTR 1kg';
        $raw['lines'][0]['item_id'] = $other->id;
        $next = $reader->tidy($raw);
        $this->assertSame('Agora', $next['shop']);
        $this->assertSame('Agora  Hulhumale branch', $next['shop_as_read']);
        $this->assertSame($this->butter->id, $next['lines'][0]['item_id']);

        // And the reader is shown both, for wordings that are only close.
        $context = $reader->context();
        $this->assertStringContainsString('AGORA HULHUMALE BRANCH → Agora', $context);
        $this->assertStringContainsString('ANCHOR UNSALTED BTR 1KG → ' . $this->butter->id, $context);
    }

    public function test_a_later_answer_replaces_an_earlier_one_and_a_matching_name_teaches_nothing(): void
    {
        $names = app(BillNames::class);
        $ghee = InventoryItem::create(['name' => 'Ghee', 'unit' => 'kg', 'unit_cost' => 90, 'is_active' => true]);
        $names->learn('Agora', $this->agora, [
            ['bill_name' => 'BUTTER', 'inventory_item_id' => $this->butter->id],
            ['bill_name' => 'BTR GHEE', 'inventory_item_id' => $this->butter->id],
        ]);
        $this->assertNull($names->shopFor('Agora'));
        $this->assertNull($names->itemFor('butter'));
        $this->assertSame($this->butter->id, $names->itemFor('btr ghee'));

        $names->learn('Agora', $this->agora, [['bill_name' => 'BTR GHEE', 'inventory_item_id' => $ghee->id]]);
        $this->assertSame($ghee->id, $names->itemFor('BTR  GHEE'));
        // An item switched off is not offered.
        $ghee->update(['is_active' => false]);
        $this->assertNull($names->itemFor('BTR GHEE'));
    }
}
