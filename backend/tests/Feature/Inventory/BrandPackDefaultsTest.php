<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Domains\Inventory\Services\BrandPackDefaults;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\InventoryPurchaseUnit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Packs that belong to a brand, each with a price the buying screen opens at.
 *
 * Owner, 2026-09-12: "options to add different brands and packaging options to
 * each brand and default price to each brand. And when the default amount is
 * changed in manual po, the latest values automatically update in the system."
 *
 * Two halves that have to hold together. The item editor decides what exists —
 * Amul's tin, Nestlé's jar — and what each one normally costs. Purchasing then
 * keeps those figures true: a price typed onto an order is this week's price
 * and replaces the guess. Neither half is much use alone; a register nobody
 * maintains goes stale, and a memory of the last purchase cannot describe a
 * brand you have not bought yet.
 */
class BrandPackDefaultsTest extends TestCase
{
    use RefreshDatabase;

    private InventoryItem $ghee;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->ghee = InventoryItem::create([
            'name' => 'Ghee', 'unit' => 'kg', 'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);
    }

    private function addPack(array $payload)
    {
        return $this->postJson("/api/inventory/{$this->ghee->id}/purchase-units", $payload);
    }

    public function test_two_brands_may_each_have_a_pack_of_the_same_name(): void
    {
        /*
         * The reason the unique index moved. "Tin" is what both suppliers call
         * their box, and before this the second one was refused as a duplicate
         * or silently resized the first.
         */
        $this->addPack(['name' => 'Tin', 'base_units' => 1, 'brand' => 'Amul'])->assertCreated();
        $this->addPack(['name' => 'Tin', 'base_units' => 0.5, 'brand' => 'Nestlé'])->assertCreated();

        $this->assertSame(2, $this->ghee->purchaseUnits()->where('name', 'Tin')->count());
    }

    public function test_one_brand_still_cannot_have_the_same_pack_twice_at_a_different_size(): void
    {
        // The guard that was already there, now scoped to the brand.
        $this->addPack(['name' => 'Tin', 'base_units' => 1, 'brand' => 'Amul'])->assertCreated();

        $this->addPack(['name' => 'Tin', 'base_units' => 2, 'brand' => 'Amul'])
            ->assertStatus(409)
            ->assertJsonPath('conflict', 'pack_name_in_use');
    }

    public function test_a_brand_is_one_brand_however_it_is_typed(): void
    {
        // Same folding as the brand photos use, so "amul" and "Amul " are one
        // brand on both screens rather than two that look identical.
        $this->addPack(['name' => 'Tin', 'base_units' => 1, 'brand' => 'Amul'])->assertCreated();

        $this->addPack(['name' => 'Tin', 'base_units' => 3, 'brand' => '  amul  '])
            ->assertStatus(409);
    }

    public function test_a_pack_carries_the_price_it_was_given(): void
    {
        $res = $this->addPack([
            'name' => 'Tin', 'base_units' => 1, 'brand' => 'Amul', 'default_unit_cost' => 185,
        ])->assertCreated();

        $pack = InventoryPurchaseUnit::findOrFail($res->json('purchase_unit.id'));
        $this->assertSame('185.00', (string) $pack->default_unit_cost);
        $this->assertNotNull($pack->default_cost_updated_at);
    }

    public function test_the_packs_listing_says_which_brand_each_pack_is_for(): void
    {
        $this->addPack(['name' => 'Tin', 'base_units' => 1, 'brand' => 'Amul', 'default_unit_cost' => 185]);
        $this->addPack(['name' => 'Loose kg', 'base_units' => 1]);

        $rows = $this->getJson("/api/inventory/{$this->ghee->id}/purchase-units")
            ->assertOk()->json('purchase_units');

        $byName = collect($rows)->keyBy('name');
        $this->assertSame('Amul', $byName['Tin']['brand']);
        $this->assertSame('amul', $byName['Tin']['brand_key']);
        // A pack with no brand belongs to the item, whichever brand is bought.
        $this->assertNull($byName['Loose kg']['brand']);
        $this->assertSame('', $byName['Loose kg']['brand_key']);
    }

    public function test_a_brand_is_offered_its_own_packs_and_the_shared_ones(): void
    {
        $this->addPack(['name' => 'Tin', 'base_units' => 1, 'brand' => 'Amul']);
        $this->addPack(['name' => 'Jar', 'base_units' => 0.5, 'brand' => 'Nestlé']);
        $this->addPack(['name' => 'Loose kg', 'base_units' => 1]);

        $names = collect(app(BrandPackDefaults::class)->packsFor($this->ghee->fresh(), 'Amul'))
            ->pluck('name')->all();

        $this->assertContains('Tin', $names);
        $this->assertContains('Loose kg', $names);
        $this->assertNotContains('Jar', $names, "Nestlé's jar is not something you can buy Amul in.");
    }

    public function test_the_brands_own_pack_is_offered_before_the_shared_one(): void
    {
        // The buying screen takes the first, so ordering is the behaviour.
        $this->addPack(['name' => 'Loose kg', 'base_units' => 1]);
        $this->addPack(['name' => 'Tin', 'base_units' => 1, 'brand' => 'Amul', 'default_unit_cost' => 185]);

        $packs = app(BrandPackDefaults::class)->packsFor($this->ghee->fresh(), 'Amul');

        $this->assertSame('Tin', $packs[0]['name']);
        $this->assertSame(185.0, $packs[0]['default_unit_cost']);
    }

    public function test_buying_at_a_new_price_updates_what_the_pack_opens_at(): void
    {
        /*
         * The half the owner asked for by name. The editor said 185; the
         * supplier charged 210; the next order should open at 210 without
         * anybody going back to the item to retype it.
         */
        $res = $this->addPack([
            'name' => 'Tin', 'base_units' => 1, 'brand' => 'Amul', 'default_unit_cost' => 185,
        ]);
        $packId = $res->json('purchase_unit.id');

        app(BrandPackDefaults::class)->rememberFromLine($this->ghee->fresh(), $packId, 210);

        $this->assertSame('210.00', (string) InventoryPurchaseUnit::findOrFail($packId)->default_unit_cost);
    }

    public function test_one_brands_price_does_not_move_another_brands(): void
    {
        $amul = $this->addPack(['name' => 'Tin', 'base_units' => 1, 'brand' => 'Amul', 'default_unit_cost' => 185])
            ->json('purchase_unit.id');
        $nestle = $this->addPack(['name' => 'Tin', 'base_units' => 0.5, 'brand' => 'Nestlé', 'default_unit_cost' => 120])
            ->json('purchase_unit.id');

        app(BrandPackDefaults::class)->rememberFromLine($this->ghee->fresh(), $amul, 210);

        $this->assertSame('120.00', (string) InventoryPurchaseUnit::findOrFail($nestle)->default_unit_cost);
    }

    public function test_a_zero_on_a_half_typed_line_does_not_wipe_a_good_price(): void
    {
        $packId = $this->addPack([
            'name' => 'Tin', 'base_units' => 1, 'brand' => 'Amul', 'default_unit_cost' => 185,
        ])->json('purchase_unit.id');

        app(BrandPackDefaults::class)->rememberFromLine($this->ghee->fresh(), $packId, 0);

        $this->assertSame('185.00', (string) InventoryPurchaseUnit::findOrFail($packId)->default_unit_cost);
    }

    public function test_reordering_at_the_same_price_leaves_the_date_alone(): void
    {
        /*
         * So "set in March" keeps reading as March. A timestamp refreshed by
         * every reorder would say a price was reviewed when it was only
         * repeated, which is exactly the thing somebody checks it for.
         */
        $packId = $this->addPack([
            'name' => 'Tin', 'base_units' => 1, 'brand' => 'Amul', 'default_unit_cost' => 185,
        ])->json('purchase_unit.id');

        InventoryPurchaseUnit::findOrFail($packId)
            ->forceFill(['default_cost_updated_at' => now()->subMonths(6)])->save();
        $was = InventoryPurchaseUnit::findOrFail($packId)->default_cost_updated_at;

        app(BrandPackDefaults::class)->rememberFromLine($this->ghee->fresh(), $packId, 185);

        $this->assertEquals(
            $was->toIso8601String(),
            InventoryPurchaseUnit::findOrFail($packId)->default_cost_updated_at->toIso8601String(),
        );
    }

    public function test_a_line_bought_loose_has_no_pack_to_remember_against(): void
    {
        $this->assertNull(
            app(BrandPackDefaults::class)->rememberFromLine($this->ghee, null, 210),
        );
    }

    public function test_a_pack_of_another_item_is_never_written_to(): void
    {
        // The same guard PurchasePackResolver applies: another item's pack
        // reaching this one would price it by somebody else's box.
        $other = InventoryItem::create([
            'name' => 'Flour', 'unit' => 'kg', 'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);
        $foreign = $this->postJson("/api/inventory/{$other->id}/purchase-units", [
            'name' => 'Sack', 'base_units' => 25, 'default_unit_cost' => 400,
        ])->json('purchase_unit.id');

        app(BrandPackDefaults::class)->rememberFromLine($this->ghee->fresh(), $foreign, 999);

        $this->assertSame('400.00', (string) InventoryPurchaseUnit::findOrFail($foreign)->default_unit_cost);
    }

    public function test_a_price_can_be_cleared_and_stops_claiming_a_date(): void
    {
        $packId = $this->addPack([
            'name' => 'Tin', 'base_units' => 1, 'brand' => 'Amul', 'default_unit_cost' => 185,
        ])->json('purchase_unit.id');

        $this->patchJson("/api/inventory/{$this->ghee->id}/purchase-units/{$packId}", [
            'default_unit_cost' => null,
        ])->assertOk();

        $pack = InventoryPurchaseUnit::findOrFail($packId);
        $this->assertNull($pack->default_unit_cost);
        $this->assertNull($pack->default_cost_updated_at);
    }

    public function test_a_pack_can_be_moved_to_a_brand_after_the_fact(): void
    {
        // Packs that already exist are shared; naming a brand is how you split
        // them once you notice two suppliers use different boxes.
        $packId = $this->addPack(['name' => 'Tin', 'base_units' => 1])->json('purchase_unit.id');

        $this->patchJson("/api/inventory/{$this->ghee->id}/purchase-units/{$packId}", [
            'brand' => 'Amul',
        ])->assertOk();

        $pack = InventoryPurchaseUnit::findOrFail($packId);
        $this->assertSame('Amul', $pack->brand);
        $this->assertSame('amul', $pack->brand_key);
    }
}
