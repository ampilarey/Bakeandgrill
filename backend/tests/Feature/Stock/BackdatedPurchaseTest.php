<?php

declare(strict_types=1);

namespace Tests\Feature\Stock;

use App\Domains\Inventory\Services\BackdatePolicy;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Reporting\Services\ReportsService;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\Role;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\SupplierPriceHistory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Entering a purchase under the day it actually happened.
 *
 * Asked 2026-09-04: "Can i add an item i bought backdated?" — it half worked.
 *
 *   B1 a second backdated purchase collided on the generated PO number
 *   B2 the buying list stamped now() with no way to say otherwise
 *   B3 the expense it raised was dated today, not the day of the buying
 *   B4 the stock ledger had no date of its own, so reports saw it as today
 *   B5 nothing stopped a purchase being dated in the future
 */
class BackdatedPurchaseTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private InventoryItem $rice;

    private Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'owner@backdate.test',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->supplier = Supplier::create(['name' => 'Corner Shop', 'is_active' => true]);

        $this->rice = InventoryItem::create([
            'name' => 'Rice',
            'sku' => 'RICE-BD',
            'unit' => 'kg',
            'current_stock' => 10,
            'unit_cost' => 20,
            'is_active' => true,
        ]);
    }

    /** @return array<string, mixed> */
    private function payload(string $date, float $unitCost = 30): array
    {
        return [
            'supplier_id' => $this->supplier->id,
            'purchase_date' => $date,
            'status' => 'received',
            'items' => [[
                'inventory_item_id' => $this->rice->id,
                'quantity' => 10,
                'unit_cost' => $unitCost,
            ]],
        ];
    }

    // ── B1 ────────────────────────────────────────────────────────────

    public function test_several_backdated_purchases_on_one_day_all_save(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $this->postJson('/api/purchases', $this->payload(now()->subDays(14)->toDateString()))->assertSuccessful();
        $this->postJson('/api/purchases', $this->payload(now()->subDays(9)->toDateString()))->assertSuccessful();
        $this->postJson('/api/purchases', $this->payload(now()->toDateString()))->assertSuccessful();

        $this->assertSame(3, Purchase::count(), 'all three saved');
        $this->assertSame(
            3,
            Purchase::distinct()->count('purchase_number'),
            'each got its own number',
        );
    }

    // ── B4 ────────────────────────────────────────────────────────────

    public function test_a_backdated_receipt_is_ledgered_on_the_day_it_arrived(): void
    {
        $when = now()->subDays(14);

        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson('/api/purchases', $this->payload($when->toDateString()))->assertSuccessful();

        $movement = StockMovement::where('type', 'purchase')->firstOrFail();

        $this->assertSame($when->toDateString(), $movement->occurred_at->toDateString());
        $this->assertSame(now()->toDateString(), $movement->created_at->toDateString(), 'still records when it was typed in');

        // The stock and cost move exactly as a same-day receipt would.
        $this->rice->refresh();
        $this->assertSame(20.0, (float) $this->rice->current_stock);
        $this->assertSame(25.0, (float) $this->rice->unit_cost); // (10×20 + 10×30) ÷ 20

        $price = SupplierPriceHistory::firstOrFail();
        $this->assertSame($when->toDateString(), $price->recorded_at->toDateString());
    }

    public function test_the_usage_variance_report_counts_it_in_the_week_it_arrived(): void
    {
        $when = now()->subDays(14);

        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson('/api/purchases', $this->payload($when->toDateString()))->assertSuccessful();

        // A count on the same day found 3kg missing, so the line is worth listing.
        StockMovement::create([
            'inventory_item_id' => $this->rice->id, 'type' => 'adjustment', 'quantity' => -3,
            'balance_after' => 17, 'unit_cost' => 20, 'reference_type' => 'stock_count',
            'occurred_at' => $when->copy()->setTime(15, 0),
        ]);

        $reports = app(ReportsService::class);

        $thatWeek = $reports->usageVariance($when->copy()->subDays(2)->startOfDay(), $when->copy()->addDays(2)->endOfDay());
        $this->assertSame(10.0, (float) $thatWeek['items'][0]['received'], 'the delivery lands in the week it arrived');

        $thisWeek = $reports->usageVariance(now()->subDay()->startOfDay(), now()->endOfDay());
        $this->assertSame([], $thisWeek['items'], 'and not in the week it was entered');
    }

    /** History written before the column existed still reports correctly. */
    public function test_a_movement_with_no_occurred_at_falls_back_to_created_at(): void
    {
        $movement = StockMovement::create([
            'inventory_item_id' => $this->rice->id, 'type' => 'adjustment', 'quantity' => -2,
            'balance_after' => 8, 'unit_cost' => 20, 'reference_type' => 'stock_count',
        ]);
        $movement->forceFill(['occurred_at' => null])->save();

        $out = app(ReportsService::class)->usageVariance(now()->subDay()->startOfDay(), now()->endOfDay());

        $this->assertSame(-2.0, (float) $out['items'][0]['unexplained']);
    }

    // ── B5 ────────────────────────────────────────────────────────────

    public function test_a_future_dated_purchase_is_refused(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $this->postJson('/api/purchases', $this->payload(now()->addDay()->toDateString()))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['purchase_date']);

        $this->assertSame(0, Purchase::count());
    }

    public function test_a_purchase_older_than_the_window_is_refused(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $tooOld = now()->subDays(BackdatePolicy::DEFAULT_MAX_DAYS + 5)->toDateString();
        $this->postJson('/api/purchases', $this->payload($tooOld))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['purchase_date']);
    }

    // ── B2 / B3 ───────────────────────────────────────────────────────

    public function test_the_buying_list_accepts_the_day_it_was_bought(): void
    {
        $when = now()->subDays(3);

        $pr = PurchaseRequest::create([
            'request_no' => 'PR-BD-1',
            'requested_by' => $this->owner->id,
            'status' => 'assigned',
            'title' => 'Saturday run',
        ]);
        $line = PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'inventory_item_id' => $this->rice->id,
            'free_text_name' => 'Rice',
            'requested_qty' => 10,
            'requested_unit' => 'kg',
            'status' => 'assigned',
        ]);

        Sanctum::actingAs($this->owner, ['staff']);

        $this->postJson("/api/purchase-requests/{$pr->id}/items/{$line->id}/mark-bought", [
            'actual_qty' => 10,
            'actual_unit_cost_laar' => 3000,
            'bought_at' => $when->toDateString(),
        ])->assertOk();

        $this->assertSame($when->toDateString(), $line->fresh()->bought_at->toDateString());

        // Verifying it later still ledgers it under the day of the shopping.
        $this->postJson("/api/purchase-requests/{$pr->id}/items/{$line->id}/verify-received")->assertOk();

        $movement = StockMovement::where('reference_type', 'purchase_request')->firstOrFail();
        $this->assertSame($when->toDateString(), $movement->occurred_at->toDateString());

        $price = SupplierPriceHistory::first();
        if ($price !== null) {
            $this->assertSame($when->toDateString(), $price->recorded_at->toDateString());
        }
    }

    public function test_the_buying_list_refuses_a_future_date(): void
    {
        $pr = PurchaseRequest::create([
            'request_no' => 'PR-BD-2', 'requested_by' => $this->owner->id,
            'status' => 'assigned', 'title' => 'Run',
        ]);
        $line = PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'inventory_item_id' => $this->rice->id,
            'free_text_name' => 'Rice',
            'requested_qty' => 5,
            'requested_unit' => 'kg',
            'status' => 'assigned',
        ]);

        Sanctum::actingAs($this->owner, ['staff']);

        $this->postJson("/api/purchase-requests/{$pr->id}/items/{$line->id}/mark-bought", [
            'actual_qty' => 5,
            'bought_at' => now()->addDays(2)->toDateString(),
        ])->assertStatus(422)->assertJsonValidationErrors(['bought_at']);
    }

    /** Omitting the date keeps the old behaviour exactly: it happened now. */
    public function test_omitting_the_date_still_means_today(): void
    {
        $pr = PurchaseRequest::create([
            'request_no' => 'PR-BD-3', 'requested_by' => $this->owner->id,
            'status' => 'assigned', 'title' => 'Run',
        ]);
        $line = PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'inventory_item_id' => $this->rice->id,
            'free_text_name' => 'Rice',
            'requested_qty' => 5,
            'requested_unit' => 'kg',
            'status' => 'assigned',
        ]);

        Sanctum::actingAs($this->owner, ['staff']);

        $this->postJson("/api/purchase-requests/{$pr->id}/items/{$line->id}/mark-bought", [
            'actual_qty' => 5, 'actual_unit_cost_laar' => 2000,
        ])->assertOk();

        $this->assertSame(now()->toDateString(), $line->fresh()->bought_at->toDateString());
    }
}
