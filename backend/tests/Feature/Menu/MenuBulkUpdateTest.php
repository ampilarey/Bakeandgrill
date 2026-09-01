<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Models\AuditLog;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Owner, 2026-09-01: wanted the menu editable "like an excel sheet" — many
 * rows at once — plus one change applied to a whole selection.
 *
 * The value of a bulk endpoint is entirely in what it refuses to do, so most
 * of what is pinned here is the refusing: fields it will not touch, rows it
 * will not half-apply, and permissions it will not let a grid route around.
 */
class MenuBulkUpdateTest extends TestCase
{
    use RefreshDatabase;

    private function actAsOwner(): User
    {
        $owner = $this->makeOwner();
        Sanctum::actingAs($owner, ['staff']);

        return $owner;
    }

    private function item(array $attrs = []): Item
    {
        return $this->makeItem(false, 0, array_merge([
            'category_id' => $this->makeCategory()->id,
        ], $attrs));
    }

    private function bulk(array $changes, array $variantChanges = [])
    {
        return $this->postJson('/api/items/bulk-update', [
            'changes' => $changes,
            'variant_changes' => $variantChanges,
        ]);
    }

    private function variantItem(): Item
    {
        return $this->item(['has_variants' => true, 'base_price' => 20]);
    }

    public function test_it_updates_a_different_field_on_each_row_in_one_call(): void
    {
        $this->actAsOwner();
        $a = $this->item(['base_price' => 10, 'name' => 'Bajiya']);
        $b = $this->item(['base_price' => 20, 'is_available' => true]);

        $this->bulk([
            ['id' => $a->id, 'fields' => ['base_price' => 12.5]],
            ['id' => $b->id, 'fields' => ['is_available' => false]],
        ])->assertOk()->assertJsonPath('updated', 2);

        $this->assertEqualsWithDelta(12.5, (float) $a->fresh()->base_price, 0.001);
        $this->assertFalse((bool) $b->fresh()->is_available);
        // The row that only changed availability kept its price.
        $this->assertEqualsWithDelta(20.0, (float) $b->fresh()->base_price, 0.001);
    }

    public function test_it_only_writes_the_keys_that_were_sent(): void
    {
        // The single-item editor PATCHes the whole item, so two people editing
        // different columns clobber each other. A sparse save must not.
        $this->actAsOwner();
        $item = $this->item(['base_price' => 10, 'name' => 'Bajiya', 'sku' => 'BAJ-1']);

        $this->bulk([['id' => $item->id, 'fields' => ['base_price' => 11]]])->assertOk();

        $fresh = $item->fresh();
        $this->assertSame('Bajiya', $fresh->name);
        $this->assertSame('BAJ-1', $fresh->sku);
    }

    public function test_one_bad_row_saves_nothing_at_all(): void
    {
        // A half-applied repricing is worse than a rejected one.
        $this->actAsOwner();
        $good = $this->item(['base_price' => 10]);
        $bad = $this->item(['base_price' => 20]);

        $this->bulk([
            ['id' => $good->id, 'fields' => ['base_price' => 11]],
            ['id' => $bad->id, 'fields' => ['base_price' => -5]],
        ])
            ->assertStatus(422)
            ->assertJsonPath('row_errors.1.base_price.0', 'The base price field must be at least 0.');

        $this->assertEqualsWithDelta(10.0, (float) $good->fresh()->base_price, 0.001);
    }

    public function test_it_refuses_fields_that_belong_to_the_full_editor(): void
    {
        // Variants, photos, combos and platters are composed, not scalar —
        // a sparse row cannot express them without destroying what it omits.
        $this->actAsOwner();
        $item = $this->item();

        foreach (['variants', 'photos', 'combo_items', 'platter_groups', 'image_url', 'channel_availability'] as $field) {
            $this->bulk([['id' => $item->id, 'fields' => [$field => []]]])
                ->assertStatus(422)
                ->assertJsonPath(
                    "row_errors.0.{$field}.0",
                    'This field cannot be changed from the bulk editor.',
                );
        }
    }

    public function test_a_manager_cannot_reach_cost_price_through_the_grid(): void
    {
        // Cost is owner-only (recipes.manage) everywhere else; the bulk path
        // must not become the way around that.
        $manager = $this->makeManager();
        Sanctum::actingAs($manager, ['staff']);
        $item = $this->item(['cost' => 4]);

        $this->bulk([['id' => $item->id, 'fields' => ['cost' => 99]]])
            ->assertStatus(422)
            ->assertJsonPath('row_errors.0.cost.0', 'Only an owner may change cost price.');

        $this->assertEqualsWithDelta(4.0, (float) $item->fresh()->cost, 0.001);
    }

    public function test_an_owner_may_change_cost_price(): void
    {
        $this->actAsOwner();
        $item = $this->item(['cost' => 4]);

        $this->bulk([['id' => $item->id, 'fields' => ['cost' => 6.25]]])->assertOk();

        $this->assertEqualsWithDelta(6.25, (float) $item->fresh()->cost, 0.001);
    }

    public function test_marking_items_exempt_also_clears_the_tax_rate(): void
    {
        // tax_rate is derived, never sent — otherwise an item could read
        // "exempt" while still carrying 8%.
        $this->actAsOwner();
        $item = $this->item(['tax_code' => 'standard_8', 'tax_rate' => 8]);

        $this->bulk([['id' => $item->id, 'fields' => ['tax_code' => 'exempt']]])->assertOk();

        $fresh = $item->fresh();
        $this->assertSame('exempt', $fresh->tax_code);
        $this->assertEqualsWithDelta(0.0, (float) $fresh->tax_rate, 0.001);
    }

    public function test_turning_stock_tracking_on_also_makes_stock_count(): void
    {
        // track_stock alone does nothing: availability only consults stock when
        // availability_type is stock_based (ItemAvailabilityService).
        $this->actAsOwner();
        $item = $this->item(['track_stock' => false, 'availability_type' => 'made_to_order']);

        $this->bulk([['id' => $item->id, 'fields' => ['track_stock' => true, 'stock_quantity' => 12]]])
            ->assertOk();

        $fresh = $item->fresh();
        $this->assertTrue((bool) $fresh->track_stock);
        $this->assertSame('stock_based', $fresh->availability_type);
        $this->assertSame(12, (int) $fresh->stock_quantity);
    }

    public function test_two_rows_claiming_one_sku_are_both_named_and_nothing_saves(): void
    {
        // Each row passes `unique:items,sku` on its own — they collide only
        // with each other, which the database would report opaquely.
        $this->actAsOwner();
        $a = $this->item(['sku' => 'OLD-A']);
        $b = $this->item(['sku' => 'OLD-B']);

        $response = $this->bulk([
            ['id' => $a->id, 'fields' => ['sku' => 'SAME']],
            ['id' => $b->id, 'fields' => ['sku' => 'SAME']],
        ])->assertStatus(422);

        $response->assertJsonPath('row_errors.0.sku.0', 'Two rows in this save use the same sku (SAME).');
        $response->assertJsonPath('row_errors.1.sku.0', 'Two rows in this save use the same sku (SAME).');
        $this->assertSame('OLD-A', $a->fresh()->sku);
        $this->assertSame('OLD-B', $b->fresh()->sku);
    }

    public function test_a_sku_already_used_by_another_item_is_refused(): void
    {
        $this->actAsOwner();
        $this->item(['sku' => 'TAKEN']);
        $target = $this->item(['sku' => 'MINE']);

        $this->bulk([['id' => $target->id, 'fields' => ['sku' => 'TAKEN']]])->assertStatus(422);

        $this->assertSame('MINE', $target->fresh()->sku);
    }

    public function test_resaving_the_same_values_reports_nothing_changed(): void
    {
        $this->actAsOwner();
        $item = $this->item(['base_price' => 10]);

        $this->bulk([['id' => $item->id, 'fields' => ['base_price' => 10]]])
            ->assertOk()
            ->assertJsonPath('updated', 0)
            ->assertJsonPath('unchanged', 1);
    }

    public function test_the_same_item_twice_in_one_save_is_refused(): void
    {
        $this->actAsOwner();
        $item = $this->item();

        $this->bulk([
            ['id' => $item->id, 'fields' => ['base_price' => 11]],
            ['id' => $item->id, 'fields' => ['base_price' => 12]],
        ])->assertStatus(422);
    }

    public function test_it_records_what_changed_so_a_bulk_price_move_is_traceable(): void
    {
        // Item edits are not otherwise audited, and "who put every burger up
        // 10%?" is the question a bulk tool creates.
        $owner = $this->actAsOwner();
        $item = $this->item(['base_price' => 10]);

        $this->bulk([['id' => $item->id, 'fields' => ['base_price' => 11]]])->assertOk();

        $log = AuditLog::where('action', 'menu.bulk_update')->firstOrFail();
        $this->assertSame($owner->id, $log->user_id);
        $this->assertSame(1, $log->meta['item_count']);
        $this->assertEqualsWithDelta(10.0, (float) $log->old_values['items'][$item->id]['base_price'], 0.001);
        $this->assertEqualsWithDelta(11.0, (float) $log->new_values['items'][$item->id]['base_price'], 0.001);
    }

    public function test_it_moves_a_selection_to_another_category_and_menu_group(): void
    {
        $this->actAsOwner();
        $target = $this->makeCategory();
        $group = MenuGroup::create(['name' => 'Evening', 'slug' => 'evening-' . uniqid(), 'sort_order' => 1, 'is_active' => true]);
        $items = [$this->item(), $this->item(), $this->item()];

        $this->bulk(array_map(
            fn (Item $i) => ['id' => $i->id, 'fields' => ['category_id' => $target->id, 'menu_group_id' => $group->id]],
            $items,
        ))->assertOk()->assertJsonPath('updated', 3);

        foreach ($items as $item) {
            $this->assertSame($target->id, $item->fresh()->category_id);
            $this->assertSame($group->id, $item->fresh()->menu_group_id);
        }
    }

    public function test_it_needs_the_menu_manage_permission(): void
    {
        Sanctum::actingAs($this->makeStaff('staff'), ['staff']);
        $item = $this->item(['base_price' => 10]);

        $this->bulk([['id' => $item->id, 'fields' => ['base_price' => 99]]])->assertForbidden();

        $this->assertEqualsWithDelta(10.0, (float) $item->fresh()->base_price, 0.001);
    }

    public function test_it_rejects_an_unauthenticated_call(): void
    {
        $item = $this->item(['base_price' => 10]);

        $this->bulk([['id' => $item->id, 'fields' => ['base_price' => 99]]])->assertUnauthorized();
    }

    // ── Sizes ────────────────────────────────────────────────────────────────

    public function test_it_edits_the_price_of_each_size(): void
    {
        // Owner, 2026-09-01: "cant see variants in bulk edit". A price rise
        // means touching Full and Half, not one base price.
        $this->actAsOwner();
        $item = $this->variantItem();
        $full = $item->variants()->create(['name' => 'Full', 'price' => 20, 'is_active' => true, 'sort_order' => 0]);
        $half = $item->variants()->create(['name' => 'Half', 'price' => 12, 'is_active' => true, 'sort_order' => 1]);

        $this->bulk([], [
            ['id' => $full->id, 'fields' => ['price' => 22]],
            ['id' => $half->id, 'fields' => ['price' => 13.5]],
        ])->assertOk()->assertJsonPath('updated', 2);

        $this->assertEqualsWithDelta(22.0, (float) $full->fresh()->price, 0.001);
        $this->assertEqualsWithDelta(13.5, (float) $half->fresh()->price, 0.001);
    }

    public function test_an_item_and_its_sizes_move_in_one_transaction(): void
    {
        // Splitting them across two requests would let one half land while
        // the other failed.
        $this->actAsOwner();
        $item = $this->variantItem();
        $full = $item->variants()->create(['name' => 'Full', 'price' => 20, 'is_active' => true]);

        $this->bulk(
            [['id' => $item->id, 'fields' => ['base_price' => 25]]],
            [['id' => $full->id, 'fields' => ['price' => -1]]],
        )->assertStatus(422)->assertJsonPath('variant_row_errors.0.price.0', 'The price field must be at least 0.');

        $this->assertEqualsWithDelta(20.0, (float) $item->fresh()->base_price, 0.001);
        $this->assertEqualsWithDelta(20.0, (float) $full->fresh()->price, 0.001);
    }

    public function test_the_consumption_factor_is_editable_per_size(): void
    {
        $this->actAsOwner();
        $item = $this->variantItem();
        $half = $item->variants()->create(['name' => 'Half', 'price' => 12, 'is_active' => true]);

        $this->bulk([], [['id' => $half->id, 'fields' => ['consumption_factor' => 0.5]]])->assertOk();

        $this->assertEqualsWithDelta(0.5, $half->fresh()->consumptionFactor(), 0.001);
    }

    public function test_the_size_list_itself_cannot_be_reshaped_here(): void
    {
        // Adding, removing or reordering sizes is a decision about the item's
        // shape; a sparse row cannot say what a missing size meant.
        $this->actAsOwner();
        $item = $this->variantItem();
        $full = $item->variants()->create(['name' => 'Full', 'price' => 20, 'is_active' => true]);

        $this->bulk([], [['id' => $full->id, 'fields' => ['item_id' => 999]]])
            ->assertStatus(422)
            ->assertJsonPath(
                'variant_row_errors.0.item_id.0',
                'This field cannot be changed from the bulk editor.',
            );
    }

    public function test_a_manager_cannot_reach_size_cost_either(): void
    {
        Sanctum::actingAs($this->makeManager(), ['staff']);
        $item = $this->variantItem();
        $full = $item->variants()->create(['name' => 'Full', 'price' => 20, 'cost' => 5, 'is_active' => true]);

        $this->bulk([], [['id' => $full->id, 'fields' => ['cost' => 99]]])
            ->assertStatus(422)
            ->assertJsonPath('variant_row_errors.0.cost.0', 'Only an owner may change cost price.');

        $this->assertEqualsWithDelta(5.0, (float) $full->fresh()->cost, 0.001);
    }

    public function test_two_sizes_claiming_one_sku_are_both_refused(): void
    {
        $this->actAsOwner();
        $item = $this->variantItem();
        $a = $item->variants()->create(['name' => 'Full', 'price' => 20, 'sku' => 'V-A', 'is_active' => true]);
        $b = $item->variants()->create(['name' => 'Half', 'price' => 12, 'sku' => 'V-B', 'is_active' => true]);

        $this->bulk([], [
            ['id' => $a->id, 'fields' => ['sku' => 'DUP']],
            ['id' => $b->id, 'fields' => ['sku' => 'DUP']],
        ])->assertStatus(422);

        $this->assertSame('V-A', $a->fresh()->sku);
        $this->assertSame('V-B', $b->fresh()->sku);
    }

    public function test_a_save_carrying_neither_list_is_refused(): void
    {
        $this->actAsOwner();

        $this->bulk([], [])->assertStatus(422);
    }
}
