<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\StockCountSession;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A stocktake as a session, not a single POST.
 *
 * The existing `/inventory/stock-count` writes every line the moment it is
 * called, from whatever was typed, with the expected figure on screen while it
 * was typed. What is pinned here is the four things that fixes: the count
 * survives a dropped connection, the counter cannot see what they are meant to
 * find, the variance is valued and has to be explained, and the person who
 * counted does not accept their own shortfall.
 */
class StockCountSessionTest extends TestCase
{
    use RefreshDatabase;

    private function staff(string $roleSlug, string $email): User
    {
        $role = Role::firstOrCreate(
            ['slug' => $roleSlug],
            ['name' => ucfirst($roleSlug), 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();

        return User::create([
            'name' => ucfirst($roleSlug),
            'email' => $email,
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);
    }

    private function item(string $name, float $stock, float $cost): InventoryItem
    {
        return InventoryItem::create([
            'name' => $name,
            'unit' => 'kg',
            'current_stock' => $stock,
            'unit_cost' => $cost,
            'is_active' => true,
        ]);
    }

    private function actAs(User $user): User
    {
        Sanctum::actingAs($user, ['staff']);

        return $user;
    }

    public function test_opening_a_sheet_snapshots_every_active_item(): void
    {
        $this->actAs($this->staff('owner', 'sc-owner@test.local'));
        $this->item('Rice', 40, 12);
        $this->item('Saffron', 2, 900);

        $res = $this->postJson('/api/stock-counts', [])->assertStatus(201);

        $this->assertCount(2, $res->json('lines'));
        $this->assertSame('open', $res->json('session.status'));
        $this->assertMatchesRegularExpression('/^SC-\d{4}-\d{4}$/', $res->json('session.reference'));
    }

    public function test_the_counter_is_never_told_what_to_find(): void
    {
        /*
         * The whole reason this is a session. Showing the expected figure while
         * counting produces the expected figure, which is how a count comes
         * back clean and the shelf is still short.
         */
        $this->actAs($this->staff('owner', 'sc-blind@test.local'));
        $this->item('Rice', 40, 12);

        $res = $this->postJson('/api/stock-counts', [])->assertStatus(201);
        $line = $res->json('lines.0');

        $this->assertArrayNotHasKey('snapshot_qty', $line);
        $this->assertArrayNotHasKey('variance', $line);
        $this->assertArrayHasKey('name', $line);

        // And still hidden when the sheet is fetched again, even by an owner.
        $id = $res->json('session.id');
        $again = $this->getJson("/api/stock-counts/{$id}")->assertOk();
        $this->assertArrayNotHasKey('snapshot_qty', $again->json('lines.0'));
        $this->assertNull($again->json('variance_value_mvr'));
    }

    public function test_counts_are_saved_as_they_are_entered(): void
    {
        // An hour in the store room must not be lost to a locked phone.
        $this->actAs($this->staff('owner', 'sc-save@test.local'));
        $this->item('Rice', 40, 12);

        $open = $this->postJson('/api/stock-counts', [])->assertStatus(201);
        $id = $open->json('session.id');
        $lineId = $open->json('lines.0.id');

        $this->postJson("/api/stock-counts/{$id}/counts", [
            'entries' => [['line_id' => $lineId, 'counted_qty' => 37.5]],
        ])->assertOk();

        $this->assertSame(37.5, (float) $this->getJson("/api/stock-counts/{$id}")->json('lines.0.counted_qty'));
        // Nothing has moved yet.
        $this->assertSame(40.0, (float) InventoryItem::first()->current_stock);
        $this->assertSame(0, StockMovement::count());
    }

    public function test_a_reviewer_sees_the_variance_once_it_is_submitted(): void
    {
        $counter = $this->actAs($this->staff('owner', 'sc-rev@test.local'));
        $this->item('Rice', 40, 12);

        $open = $this->postJson('/api/stock-counts', [])->assertStatus(201);
        $id = $open->json('session.id');
        $this->postJson("/api/stock-counts/{$id}/counts", [
            'entries' => [['line_id' => $open->json('lines.0.id'), 'counted_qty' => 37]],
        ])->assertOk();
        $this->postJson("/api/stock-counts/{$id}/submit")->assertOk();

        $res = $this->getJson("/api/stock-counts/{$id}")->assertOk();
        $this->assertSame(-3.0, (float) $res->json('lines.0.variance'));
        $this->assertSame(36.0, (float) $res->json('lines.0.variance_value_mvr'));
        $this->assertSame(36.0, (float) $res->json('variance_value_mvr'));
        $this->assertSame($counter->id, $res->json('session.submitted_by'));
    }

    public function test_posting_moves_stock_by_the_variance_not_to_the_counted_figure(): void
    {
        /*
         * Sales made during the count have already come off the books. Setting
         * stock to what was counted an hour ago would put those sales back on
         * the shelf; adding the difference keeps them off and still corrects
         * what the count found.
         */
        $counter = $this->staff('manager', 'sc-counter@test.local');
        $poster = $this->staff('owner', 'sc-poster@test.local');
        $item = $this->item('Rice', 40, 12);

        $this->actAs($counter);
        $open = $this->postJson('/api/stock-counts', [])->assertStatus(201);
        $id = $open->json('session.id');
        $this->postJson("/api/stock-counts/{$id}/counts", [
            'entries' => [['line_id' => $open->json('lines.0.id'), 'counted_qty' => 37]],
        ])->assertOk();
        $this->postJson("/api/stock-counts/{$id}/submit")->assertOk();

        // Two kilos sell while the sheet waits for review.
        $item->update(['current_stock' => 38]);

        $this->actAs($poster);
        $this->postJson("/api/stock-counts/{$id}/post")->assertOk();

        // 38 on the books, 3 short against the snapshot → 35, not 37.
        $this->assertSame(35.0, (float) $item->fresh()->current_stock);
        $movement = StockMovement::where('reference_type', 'stock_count')->firstOrFail();
        $this->assertSame(-3.0, (float) $movement->quantity);
        $this->assertSame($id, (int) $movement->reference_id);
    }

    public function test_the_person_who_counted_cannot_post_it(): void
    {
        // The same separation the refund flow has.
        $counter = $this->staff('manager', 'sc-self@test.local');
        $this->item('Rice', 40, 12);

        $this->actAs($counter);
        $open = $this->postJson('/api/stock-counts', [])->assertStatus(201);
        $id = $open->json('session.id');
        $this->postJson("/api/stock-counts/{$id}/counts", [
            'entries' => [['line_id' => $open->json('lines.0.id'), 'counted_qty' => 39]],
        ])->assertOk();
        $this->postJson("/api/stock-counts/{$id}/submit")->assertOk();

        $this->postJson("/api/stock-counts/{$id}/post")->assertStatus(422);

        $this->assertSame('submitted', StockCountSession::find($id)->status);
        $this->assertSame(40.0, (float) InventoryItem::first()->current_stock);
    }

    public function test_an_owner_may_post_their_own_count(): void
    {
        // One-person shifts happen; the owner is the fallback, as with refunds.
        $owner = $this->actAs($this->staff('owner', 'sc-solo@test.local'));
        $this->item('Rice', 40, 12);

        $open = $this->postJson('/api/stock-counts', [])->assertStatus(201);
        $id = $open->json('session.id');
        $this->postJson("/api/stock-counts/{$id}/counts", [
            'entries' => [['line_id' => $open->json('lines.0.id'), 'counted_qty' => 39]],
        ])->assertOk();
        $this->postJson("/api/stock-counts/{$id}/submit")->assertOk();

        $this->postJson("/api/stock-counts/{$id}/post")->assertOk();

        $this->assertSame(39.0, (float) InventoryItem::first()->current_stock);
        $this->assertSame($owner->id, StockCountSession::find($id)->posted_by);
    }

    public function test_a_costly_variance_must_say_why_and_nothing_posts_until_it_does(): void
    {
        SiteSetting::set('stock_variance_reason_mvr', '500');
        $counter = $this->staff('manager', 'sc-reason-c@test.local');
        $poster = $this->staff('owner', 'sc-reason-p@test.local');
        $this->item('Saffron', 3, 900);
        $this->item('Rice', 40, 12);

        $this->actAs($counter);
        $open = $this->postJson('/api/stock-counts', [])->assertStatus(201);
        $id = $open->json('session.id');
        $lines = collect($open->json('lines'))->keyBy('name');
        $this->postJson("/api/stock-counts/{$id}/counts", [
            'entries' => [
                // 1 kg of saffron missing is MVR 900 — over the threshold.
                ['line_id' => $lines['Saffron']['id'], 'counted_qty' => 2],
                ['line_id' => $lines['Rice']['id'], 'counted_qty' => 38],
            ],
        ])->assertOk();
        $this->postJson("/api/stock-counts/{$id}/submit")->assertOk();

        $this->actAs($poster);
        $this->postJson("/api/stock-counts/{$id}/post")->assertStatus(422);

        // Refused as a whole: the rice did not move either.
        $this->assertSame(40.0, (float) InventoryItem::where('name', 'Rice')->first()->current_stock);
        $this->assertSame(3.0, (float) InventoryItem::where('name', 'Saffron')->first()->current_stock);

        // The reviewer sends it back rather than cancelling an hour of work.
        $this->postJson("/api/stock-counts/{$id}/reopen", ['note' => 'Saffron needs a reason.'])->assertOk();
        $this->assertSame('open', StockCountSession::find($id)->status);

        // With a reason it goes through, and the reason lands on the movement.
        $this->actAs($counter);
        $this->postJson("/api/stock-counts/{$id}/counts", [
            'entries' => [[
                'line_id' => $lines['Saffron']['id'],
                'counted_qty' => 2,
                'note' => 'Spilled during Friday prep, logged with the chef.',
            ]],
        ])->assertOk();
        $this->postJson("/api/stock-counts/{$id}/submit")->assertOk();

        $this->actAs($poster);
        $this->postJson("/api/stock-counts/{$id}/post")->assertOk();

        $this->assertSame(2.0, (float) InventoryItem::where('name', 'Saffron')->first()->current_stock);
        $saffronId = InventoryItem::where('name', 'Saffron')->value('id');
        $this->assertStringContainsString(
            'Spilled',
            (string) StockMovement::where('reference_type', 'stock_count')
                ->where('inventory_item_id', $saffronId)->firstOrFail()->notes,
        );
    }

    public function test_an_uncounted_line_is_skipped_rather_than_treated_as_zero(): void
    {
        // "I did not get to the flour" is not "there is no flour".
        $counter = $this->staff('manager', 'sc-skip-c@test.local');
        $poster = $this->staff('owner', 'sc-skip-p@test.local');
        $this->item('Rice', 40, 12);
        $this->item('Flour', 25, 8);

        $this->actAs($counter);
        $open = $this->postJson('/api/stock-counts', [])->assertStatus(201);
        $id = $open->json('session.id');
        $lines = collect($open->json('lines'))->keyBy('name');
        $this->postJson("/api/stock-counts/{$id}/counts", [
            'entries' => [['line_id' => $lines['Rice']['id'], 'counted_qty' => 38]],
        ])->assertOk();
        $this->postJson("/api/stock-counts/{$id}/submit")->assertOk();

        $this->actAs($poster);
        $this->postJson("/api/stock-counts/{$id}/post")->assertOk();

        $this->assertSame(38.0, (float) InventoryItem::where('name', 'Rice')->first()->current_stock);
        $this->assertSame(25.0, (float) InventoryItem::where('name', 'Flour')->first()->current_stock);
        $this->assertSame(1, StockMovement::where('reference_type', 'stock_count')->count());
    }

    public function test_only_one_sheet_can_be_open_at_a_time(): void
    {
        // Two sheets over the same shelves would each snapshot the other's work.
        $this->actAs($this->staff('owner', 'sc-one@test.local'));
        $this->item('Rice', 40, 12);

        $this->postJson('/api/stock-counts', [])->assertStatus(201);
        $this->postJson('/api/stock-counts', [])->assertStatus(422);
    }

    public function test_floor_staff_can_count_but_not_post(): void
    {
        $staff = $this->staff('staff', 'sc-floor@test.local');
        $poster = $this->staff('owner', 'sc-floor-p@test.local');
        $this->item('Rice', 40, 12);

        $this->actAs($staff);
        $open = $this->postJson('/api/stock-counts', [])->assertStatus(201);
        $id = $open->json('session.id');
        $this->postJson("/api/stock-counts/{$id}/counts", [
            'entries' => [['line_id' => $open->json('lines.0.id'), 'counted_qty' => 37]],
        ])->assertOk();
        $this->postJson("/api/stock-counts/{$id}/submit")->assertOk();

        // Even after submission, a counter is not shown the variance.
        $this->assertArrayNotHasKey('variance', $this->getJson("/api/stock-counts/{$id}")->json('lines.0'));
        $this->postJson("/api/stock-counts/{$id}/post")->assertStatus(403);

        $this->actAs($poster);
        $this->postJson("/api/stock-counts/{$id}/post")->assertOk();
    }

    public function test_a_reviewer_can_send_a_sheet_back_without_losing_the_counts(): void
    {
        /*
         * The reviewer's third option. Posting is all-or-nothing and refuses a
         * costly variance with no reason, so without this the only ways out
         * were to cancel an hour of counting or to post something unexplained.
         */
        $counter = $this->staff('manager', 'sc-back-c@test.local');
        $poster = $this->staff('owner', 'sc-back-p@test.local');
        $this->item('Rice', 40, 12);

        $this->actAs($counter);
        $open = $this->postJson('/api/stock-counts', [])->assertStatus(201);
        $id = $open->json('session.id');
        $this->postJson("/api/stock-counts/{$id}/counts", [
            'entries' => [['line_id' => $open->json('lines.0.id'), 'counted_qty' => 37]],
        ])->assertOk();
        $this->postJson("/api/stock-counts/{$id}/submit")->assertOk();

        $this->actAs($poster);
        $this->postJson("/api/stock-counts/{$id}/reopen", ['note' => 'Recheck the back shelf.'])->assertOk();

        $session = StockCountSession::find($id);
        $this->assertSame('open', $session->status);
        $this->assertNull($session->submitted_by);

        // The hour of counting survives, and entry is possible again.
        $this->actAs($counter);
        $res = $this->getJson("/api/stock-counts/{$id}")->assertOk();
        $this->assertSame(37.0, (float) $res->json('lines.0.counted_qty'));
        $this->postJson("/api/stock-counts/{$id}/counts", [
            'entries' => [['line_id' => $open->json('lines.0.id'), 'counted_qty' => 38]],
        ])->assertOk();
    }

    public function test_a_counter_cannot_send_a_sheet_back_to_themselves(): void
    {
        // Otherwise reopen is a way around the two-person rule.
        $counter = $this->staff('staff', 'sc-back-loop@test.local');
        $this->item('Rice', 40, 12);

        $this->actAs($counter);
        $open = $this->postJson('/api/stock-counts', [])->assertStatus(201);
        $id = $open->json('session.id');
        $this->postJson("/api/stock-counts/{$id}/counts", [
            'entries' => [['line_id' => $open->json('lines.0.id'), 'counted_qty' => 37]],
        ])->assertOk();
        $this->postJson("/api/stock-counts/{$id}/submit")->assertOk();

        $this->postJson("/api/stock-counts/{$id}/reopen")->assertStatus(403);
    }

    public function test_a_cancelled_sheet_moves_nothing_and_frees_the_slot(): void
    {
        $this->actAs($this->staff('owner', 'sc-cancel@test.local'));
        $this->item('Rice', 40, 12);

        $open = $this->postJson('/api/stock-counts', [])->assertStatus(201);
        $id = $open->json('session.id');
        $this->postJson("/api/stock-counts/{$id}/counts", [
            'entries' => [['line_id' => $open->json('lines.0.id'), 'counted_qty' => 1]],
        ])->assertOk();

        $this->postJson("/api/stock-counts/{$id}/cancel")->assertOk();

        $this->assertSame(40.0, (float) InventoryItem::first()->current_stock);
        $this->assertSame(0, StockMovement::count());
        $this->postJson('/api/stock-counts', [])->assertStatus(201);
    }

    public function test_entry_is_refused_once_the_sheet_is_submitted(): void
    {
        $this->actAs($this->staff('owner', 'sc-locked@test.local'));
        $this->item('Rice', 40, 12);

        $open = $this->postJson('/api/stock-counts', [])->assertStatus(201);
        $id = $open->json('session.id');
        $lineId = $open->json('lines.0.id');
        $this->postJson("/api/stock-counts/{$id}/counts", [
            'entries' => [['line_id' => $lineId, 'counted_qty' => 37]],
        ])->assertOk();
        $this->postJson("/api/stock-counts/{$id}/submit")->assertOk();

        $this->postJson("/api/stock-counts/{$id}/counts", [
            'entries' => [['line_id' => $lineId, 'counted_qty' => 999]],
        ])->assertStatus(422);
    }
}
