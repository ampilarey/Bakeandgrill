<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\Supplier;
use App\Services\LegacyPurchaseSettlementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-21, looking at 103 unpaid orders on the Suppliers tab:
 * "still same". The command was the whole answer and it lived on the
 * server. This is the same work from the card that raised the question.
 */
class LegacyPayablesEndpointTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    private function order(string $number, float $total, ?string $date, string $status = 'received'): Purchase
    {
        $item = InventoryItem::firstOrCreate(['name' => 'Flour'], ['unit' => 'kg', 'unit_cost' => 10, 'is_active' => true]);
        $po = Purchase::create([
            'purchase_number' => $number,
            'supplier_id' => Supplier::firstOrCreate(['name' => 'Agora'])->id,
            'purchase_date' => $date,
            'status' => $status,
            'subtotal' => $total,
            'total' => $total,
        ]);
        PurchaseItem::create(['purchase_id' => $po->id, 'inventory_item_id' => $item->id, 'quantity' => 1, 'unit_cost' => $total, 'total_cost' => $total]);

        return $po;
    }

    public function test_the_card_is_told_how_much_of_the_debt_predates_tracking(): void
    {
        $this->order('PO-1', 300, '2026-09-02');
        $this->order('PO-2', 120, '2026-09-19');
        $this->order('PO-3', 500, '2026-09-25');
        Sanctum::actingAs($this->makeManager(), ['staff']);

        $res = $this->getJson('/api/purchasing/payables/legacy')->assertOk();

        $res->assertJsonPath('orders', 2);
        $res->assertJsonPath('total', 420);
        $res->assertJsonPath('before', LegacyPurchaseSettlementService::TRACKING_STARTED);
        $res->assertJsonPath('suppliers.0.name', 'Agora');

        // And the card itself still shows all three, which is the gap.
        $this->getJson('/api/purchasing/payables')->assertOk()->assertJsonPath('orders', 3);
    }

    /**
     * purchase_date is nullable. The payables card counts an order with no
     * date; a date filter silently skipped it, so the button would have
     * left behind exactly the rows the owner was asking about.
     */
    public function test_an_order_with_no_date_of_its_own_is_judged_by_when_it_was_entered(): void
    {
        $old = $this->order('PO-1', 300, null);
        $old->forceFill(['created_at' => '2026-09-05 08:00:00'])->save();
        $recent = $this->order('PO-2', 90, null);
        $recent->forceFill(['created_at' => '2026-09-30 08:00:00'])->save();

        Sanctum::actingAs($this->makeManager(), ['staff']);

        $this->getJson('/api/purchasing/payables/legacy')->assertOk()
            ->assertJsonPath('orders', 1)
            ->assertJsonPath('total', 300);
    }

    public function test_settling_clears_them_and_leaves_one_audit_entry_for_the_lot(): void
    {
        $a = $this->order('PO-1', 300, '2026-09-02');
        $b = $this->order('PO-2', 120, '2026-09-19');
        $after = $this->order('PO-3', 500, '2026-09-25');
        Sanctum::actingAs($this->makeManager(), ['staff']);

        $this->postJson('/api/purchasing/payables/legacy/settle')->assertOk()
            ->assertJsonPath('settled', 2)
            ->assertJsonPath('total', 420);

        $this->assertSame('paid', $a->fresh()->payment_status);
        $this->assertSame('paid', $b->fresh()->payment_status);
        $this->assertSame('unpaid', $after->fresh()->payment_status);
        $this->assertSame(LegacyPurchaseSettlementService::METHOD, $a->fresh()->payment_method);
        $this->assertSame('2026-09-02', $a->fresh()->paid_at->toDateString());

        // The card is now down to the one that is really owed.
        $this->getJson('/api/purchasing/payables')->assertOk()->assertJsonPath('orders', 1);

        $log = AuditLog::query()->where('action', 'purchase.legacy_payables_settled')->sole();
        $this->assertSame(2, $log->meta['orders']);
        $this->assertSame(['PO-1', 'PO-2'], $log->meta['purchase_numbers']);
    }

    public function test_an_order_can_be_kept_owing_by_its_number(): void
    {
        $settle = $this->order('PO-1', 300, '2026-09-02');
        $keep = $this->order('PO-2', 450, '2026-09-03');
        Sanctum::actingAs($this->makeManager(), ['staff']);

        $this->postJson('/api/purchasing/payables/legacy/settle', ['except' => ['PO-2']])->assertOk()
            ->assertJsonPath('settled', 1);

        $this->assertSame('paid', $settle->fresh()->payment_status);
        $this->assertSame('unpaid', $keep->fresh()->payment_status);
    }

    public function test_settling_twice_is_harmless_and_a_bad_date_is_refused(): void
    {
        $this->order('PO-1', 300, '2026-09-02');
        Sanctum::actingAs($this->makeManager(), ['staff']);

        $this->postJson('/api/purchasing/payables/legacy/settle')->assertOk()->assertJsonPath('settled', 1);
        $this->postJson('/api/purchasing/payables/legacy/settle')->assertOk()->assertJsonPath('settled', 0);

        $this->postJson('/api/purchasing/payables/legacy/settle', ['before' => 'whenever'])->assertStatus(422);
    }

    public function test_it_needs_a_signed_in_user_with_the_purchasing_permission(): void
    {
        $this->order('PO-1', 300, '2026-09-02');

        $this->getJson('/api/purchasing/payables/legacy')->assertUnauthorized();
        $this->postJson('/api/purchasing/payables/legacy/settle')->assertUnauthorized();
    }
}
