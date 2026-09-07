<?php

declare(strict_types=1);

namespace Tests\Feature\Purchasing;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-07: "sometimes we buy 6 pcs packets. And sometimes 10 pcs
 * packets." Two real sizes of the same bun, both bought regularly.
 *
 * Adding a pack whose name is already taken used to resize the existing one
 * without a word, so typing "Packet" for the 10s turned the 6s into 10s and
 * every later order of that item quietly converted wrong. Both readings are
 * legitimate — a correction, or a second size — so it asks.
 */
class PackNameConflictTest extends TestCase
{
    use RefreshDatabase;

    private InventoryItem $bun;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->bun = InventoryItem::create([
            'name' => 'Hotdog bun', 'unit' => 'piece', 'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);
        $this->postJson("/api/inventory/{$this->bun->id}/purchase-units", ['name' => 'Packet', 'base_units' => 6])
            ->assertCreated();
    }

    public function test_a_taken_name_for_a_different_size_asks_instead_of_overwriting(): void
    {
        $res = $this->postJson("/api/inventory/{$this->bun->id}/purchase-units", ['name' => 'Packet', 'base_units' => 10])
            ->assertStatus(409)
            ->json();

        $this->assertSame('pack_name_in_use', $res['conflict']);
        $this->assertSame(6.0, (float) $res['existing']['base_units']);
        $this->assertSame(10.0, (float) $res['requested_base_units']);
        $this->assertSame('Packet 10', $res['suggested_name']);
        $this->assertStringContainsString('already holds 6', $res['message']);

        // Nothing moved: the 6s are still the 6s.
        $this->assertSame(1, $this->bun->purchaseUnits()->count());
        $this->assertSame(6.0, (float) $this->bun->purchaseUnits()->first()->base_units);
    }

    public function test_the_suggested_name_gives_the_item_both_sizes(): void
    {
        $this->postJson("/api/inventory/{$this->bun->id}/purchase-units", ['name' => 'Packet 10', 'base_units' => 10])
            ->assertCreated();

        $packs = $this->bun->purchaseUnits()->orderBy('base_units')->get();
        $this->assertSame(['Packet', 'Packet 10'], $packs->pluck('name')->all());
        $this->assertSame([6.0, 10.0], $packs->pluck('base_units')->map(fn ($n) => (float) $n)->all());
    }

    public function test_a_genuine_correction_still_goes_through(): void
    {
        $this->postJson("/api/inventory/{$this->bun->id}/purchase-units", ['name' => 'Packet', 'base_units' => 10, 'replace' => true])
            ->assertOk();

        $this->assertSame(1, $this->bun->purchaseUnits()->count());
        $this->assertSame(10.0, (float) $this->bun->purchaseUnits()->first()->base_units);
    }

    public function test_the_same_name_at_the_same_size_is_not_a_conflict(): void
    {
        // Re-adding what is already there, e.g. a double submit: unchanged.
        $this->postJson("/api/inventory/{$this->bun->id}/purchase-units", ['name' => 'packet', 'base_units' => 6])
            ->assertOk();

        $this->assertSame(1, $this->bun->purchaseUnits()->count());
        $this->assertSame(6.0, (float) $this->bun->purchaseUnits()->first()->base_units);
    }

    public function test_the_suggestion_steps_past_a_name_that_is_also_taken(): void
    {
        $this->postJson("/api/inventory/{$this->bun->id}/purchase-units", ['name' => 'Packet 10', 'base_units' => 10])
            ->assertCreated();

        $res = $this->postJson("/api/inventory/{$this->bun->id}/purchase-units", ['name' => 'Packet', 'base_units' => 10])
            ->assertStatus(409)
            ->json();

        $this->assertSame('Packet 10 (2)', $res['suggested_name']);
    }

    public function test_a_size_with_decimals_reads_plainly(): void
    {
        $oil = InventoryItem::create(['name' => 'Oil', 'unit' => 'litre', 'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true]);
        $this->postJson("/api/inventory/{$oil->id}/purchase-units", ['name' => 'Bottle', 'base_units' => 0.5])->assertCreated();

        $res = $this->postJson("/api/inventory/{$oil->id}/purchase-units", ['name' => 'Bottle', 'base_units' => 1.5])
            ->assertStatus(409)
            ->json();

        $this->assertStringContainsString('already holds 0.5', $res['message']);
        $this->assertSame('Bottle 1.5', $res['suggested_name']);
    }
}
