<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Models\Item;
use App\Models\User;
use App\Models\Variant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Scan codes on sizes, 2026-09-01.
 *
 * A large bottle and a small bottle carry different barcodes. Everything
 * around that fact was broken: the scan endpoint only ever searched dishes,
 * the item editor wiped a size's barcode on every save, and nothing stopped
 * two rows sharing one code.
 */
class VariantScanCodeTest extends TestCase
{
    use RefreshDatabase;

    private function actAsOwner(): User
    {
        $owner = $this->makeOwner();
        Sanctum::actingAs($owner, ['staff']);

        return $owner;
    }

    private function sizedItem(string $name = 'Water'): Item
    {
        return $this->makeItem(false, 0, [
            'category_id' => $this->makeCategory()->id,
            'has_variants' => true,
            'name' => $name,
            'base_price' => 0,
        ]);
    }

    // ── Scanning ─────────────────────────────────────────────────────────────

    public function test_a_size_barcode_resolves_to_its_dish_and_its_size(): void
    {
        $item = $this->sizedItem();
        $large = $item->variants()->create([
            'name' => 'Large', 'price' => 20, 'is_active' => true, 'barcode' => '5012345',
        ]);

        $response = $this->getJson('/api/items/barcode/5012345')->assertOk();

        $this->assertSame($item->id, $response->json('item.id'));
        $this->assertSame($large->id, $response->json('variant.id'));
        $this->assertSame('Large', $response->json('variant.name'));
    }

    public function test_a_size_sku_scans_too(): void
    {
        // The endpoint has always treated SKU as a second scannable code on
        // dishes; sizes get the same treatment.
        $item = $this->sizedItem();
        $item->variants()->create([
            'name' => 'Small', 'price' => 10, 'is_active' => true, 'sku' => 'WTR-SM',
        ]);

        $this->getJson('/api/items/barcode/WTR-SM')
            ->assertOk()
            ->assertJsonPath('variant.name', 'Small');
    }

    public function test_a_dish_barcode_still_wins_and_returns_no_size(): void
    {
        $item = $this->makeItem(false, 0, [
            'category_id' => $this->makeCategory()->id,
            'barcode' => '7001',
        ]);

        $response = $this->getJson('/api/items/barcode/7001')->assertOk();

        $this->assertSame($item->id, $response->json('item.id'));
        $this->assertNull($response->json('variant'));
    }

    public function test_a_size_that_is_off_the_menu_does_not_scan(): void
    {
        $item = $this->sizedItem();
        $item->variants()->create([
            'name' => 'Retired', 'price' => 20, 'is_active' => false, 'barcode' => '5012345',
        ]);

        $this->getJson('/api/items/barcode/5012345')->assertNotFound();
    }

    public function test_a_size_sold_out_today_says_so_rather_than_404(): void
    {
        // A bare 404 reads as "no such barcode" and sends staff hunting for a
        // mislabelled bottle.
        $item = $this->sizedItem();
        $item->variants()->create([
            'name' => 'Large', 'price' => 20, 'is_active' => true,
            'is_available' => false, 'barcode' => '5012345',
        ]);

        $this->getJson('/api/items/barcode/5012345')
            ->assertStatus(422)
            ->assertSee('sold out', false);
    }

    public function test_a_size_on_an_inactive_dish_does_not_scan(): void
    {
        $item = $this->sizedItem();
        $item->update(['is_active' => false]);
        $item->variants()->create([
            'name' => 'Large', 'price' => 20, 'is_active' => true, 'barcode' => '5012345',
        ]);

        $this->getJson('/api/items/barcode/5012345')->assertNotFound();
    }

    // ── The editor no longer wipes what it cannot see ────────────────────────

    public function test_saving_a_dish_keeps_a_size_barcode_the_form_never_sent(): void
    {
        // The item editor has a SKU box per size and no barcode box, so every
        // save omitted the field — and the sync service wrote null over it.
        $this->actAsOwner();
        $item = $this->sizedItem();
        $large = $item->variants()->create([
            'name' => 'Large', 'price' => 20, 'is_active' => true, 'barcode' => '5012345',
        ]);

        $this->patchJson("/api/items/{$item->id}", [
            'variants' => [['id' => $large->id, 'name' => 'Large', 'price' => 22]],
        ])->assertOk();

        $this->assertSame('5012345', Variant::find($large->id)->barcode);
        $this->assertSame('22.00', Variant::find($large->id)->price);
    }

    public function test_sending_the_barcode_as_null_still_clears_it(): void
    {
        // Absent means leave alone; explicit null means the form owns the
        // field and the owner emptied it.
        $this->actAsOwner();
        $item = $this->sizedItem();
        $large = $item->variants()->create([
            'name' => 'Large', 'price' => 20, 'is_active' => true, 'barcode' => '5012345',
        ]);

        $this->patchJson("/api/items/{$item->id}", [
            'variants' => [['id' => $large->id, 'name' => 'Large', 'price' => 20, 'barcode' => null]],
        ])->assertOk();

        $this->assertNull(Variant::find($large->id)->barcode);
    }

    public function test_a_barcode_can_be_set_through_the_item_editor(): void
    {
        // It was not in the rules, so validated() dropped it and the field
        // could not be set here at all.
        $this->actAsOwner();
        $item = $this->sizedItem();
        $large = $item->variants()->create(['name' => 'Large', 'price' => 20, 'is_active' => true]);

        $this->patchJson("/api/items/{$item->id}", [
            'variants' => [['id' => $large->id, 'name' => 'Large', 'price' => 20, 'barcode' => '5012345']],
        ])->assertOk();

        $this->assertSame('5012345', Variant::find($large->id)->barcode);
    }

    // ── One code, one thing ─────────────────────────────────────────────────

    public function test_two_sizes_cannot_share_a_barcode(): void
    {
        $this->actAsOwner();
        $item = $this->sizedItem();
        $small = $item->variants()->create(['name' => 'Small', 'price' => 10, 'is_active' => true]);
        $large = $item->variants()->create([
            'name' => 'Large', 'price' => 20, 'is_active' => true, 'barcode' => '5012345',
        ]);

        $this->patchJson("/api/items/{$item->id}", [
            'variants' => [
                ['id' => $small->id, 'name' => 'Small', 'price' => 10, 'barcode' => '5012345'],
                ['id' => $large->id, 'name' => 'Large', 'price' => 20, 'barcode' => '5012345'],
            ],
        ])->assertStatus(422);

        $this->assertNull(Variant::find($small->id)->barcode);
    }

    public function test_a_size_cannot_take_a_barcode_a_dish_already_uses(): void
    {
        // Separate tables, separate indexes — and one scanner that searches
        // both, so the database alone cannot answer this.
        $this->actAsOwner();
        $this->makeItem(false, 0, [
            'category_id' => $this->makeCategory()->id,
            'name' => 'Bottled water',
            'barcode' => '5012345',
        ]);
        $item = $this->sizedItem('Juice');
        $large = $item->variants()->create(['name' => 'Large', 'price' => 20, 'is_active' => true]);

        $this->patchJson("/api/items/{$item->id}", [
            'variants' => [['id' => $large->id, 'name' => 'Large', 'price' => 20, 'barcode' => '5012345']],
        ])->assertStatus(422);
    }

    public function test_a_dish_cannot_take_a_barcode_a_size_already_uses(): void
    {
        $this->actAsOwner();
        $other = $this->sizedItem('Juice');
        $other->variants()->create([
            'name' => 'Large', 'price' => 20, 'is_active' => true, 'barcode' => '5012345',
        ]);
        $item = $this->makeItem(false, 0, ['category_id' => $this->makeCategory()->id]);

        $this->patchJson("/api/items/{$item->id}", ['barcode' => '5012345'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('barcode');
    }

    public function test_a_sku_and_a_barcode_share_one_namespace(): void
    {
        // The scan endpoint searches both columns, so a code in one is a code
        // taken for the other.
        $this->actAsOwner();
        $this->makeItem(false, 0, [
            'category_id' => $this->makeCategory()->id,
            'sku' => 'DUP-1',
        ]);
        $item = $this->sizedItem('Juice');
        $large = $item->variants()->create(['name' => 'Large', 'price' => 20, 'is_active' => true]);

        $this->patchJson("/api/items/{$item->id}", [
            'variants' => [['id' => $large->id, 'name' => 'Large', 'price' => 20, 'barcode' => 'DUP-1']],
        ])->assertStatus(422);
    }

    public function test_a_row_may_be_saved_again_with_the_code_it_already_has(): void
    {
        // Otherwise a collision that predates the rule would block every
        // future edit of a row that is not even changing its code.
        $this->actAsOwner();
        $item = $this->sizedItem();
        $large = $item->variants()->create([
            'name' => 'Large', 'price' => 20, 'is_active' => true, 'barcode' => '5012345',
        ]);

        $this->patchJson("/api/items/{$item->id}", [
            'variants' => [['id' => $large->id, 'name' => 'Large', 'price' => 25, 'barcode' => '5012345']],
        ])->assertOk();

        $this->assertSame('25.00', Variant::find($large->id)->price);
    }

    public function test_the_variants_endpoint_refuses_a_taken_code(): void
    {
        $this->actAsOwner();
        $other = $this->sizedItem('Juice');
        $other->variants()->create([
            'name' => 'Large', 'price' => 20, 'is_active' => true, 'barcode' => '5012345',
        ]);
        $item = $this->sizedItem();

        $this->postJson("/api/items/{$item->id}/variants", [
            'name' => 'Large', 'price' => 20, 'barcode' => '5012345',
        ])->assertStatus(422)->assertJsonValidationErrors('barcode');
    }

    // ── What the tills are given ────────────────────────────────────────────

    public function test_the_pos_feed_carries_the_codes_for_offline_scanning(): void
    {
        // The till scans against its cached copy when the connection drops.
        // Neither code was ever sent, so that fallback could not fire.
        $this->actAsOwner();
        $item = $this->sizedItem();
        $item->update(['barcode' => '7001']);
        $item->variants()->create([
            'name' => 'Large', 'price' => 20, 'is_active' => true, 'barcode' => '5012345',
        ]);

        $response = $this->getJson('/api/pos/menu')->assertOk();
        $row = collect($response->json('items'))->firstWhere('id', $item->id);

        $this->assertSame('7001', $row['barcode']);
        $this->assertSame('5012345', $row['variants'][0]['barcode']);
    }

    public function test_the_admin_feed_exposes_a_size_barcode(): void
    {
        $this->actAsOwner();
        $item = $this->sizedItem();
        $item->variants()->create([
            'name' => 'Large', 'price' => 20, 'is_active' => true, 'barcode' => '5012345',
        ]);

        $response = $this->getJson('/api/items?view=admin')->assertOk();
        $row = collect($response->json('items') ?? $response->json('data'))
            ->firstWhere('id', $item->id);

        $this->assertSame('5012345', $row['variants'][0]['barcode']);
    }
}
