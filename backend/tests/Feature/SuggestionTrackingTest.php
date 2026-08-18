<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Marketing\Services\SuggestionTracker;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemSuggestionStat;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The pair stats say what customers buy together. These say whether the panel
 * that suggests it ever changed anyone's mind — the only numbers that can
 * justify keeping the feature, or tell you a scoring change helped.
 */
class SuggestionTrackingTest extends TestCase
{
    use RefreshDatabase;

    private function item(string $name, float $price = 25.0): Item
    {
        $category = Category::firstOrCreate(
            ['slug' => 'suggest'],
            ['name' => 'Suggest', 'is_active' => true],
        );

        return Item::create([
            'category_id' => $category->id,
            'name' => $name,
            'base_price' => $price,
            'sku' => 'SUG-' . strtoupper(substr(md5($name), 0, 6)),
            'is_active' => true,
            'is_available' => true,
        ]);
    }

    public function test_shown_and_accepted_accumulate_on_one_daily_row(): void
    {
        $fries = $this->item('Fries', 25);
        $tracker = app(SuggestionTracker::class);

        $tracker->record('cart', 'shown', [$fries->id]);
        $tracker->record('cart', 'shown', [$fries->id]);
        $tracker->record('cart', 'shown', [$fries->id]);
        $tracker->record('cart', 'accepted', [$fries->id]);

        // One row per day / surface / item, not one per event.
        $this->assertDatabaseCount('item_suggestion_stats', 1);

        $row = ItemSuggestionStat::query()->first();
        $this->assertSame(3, $row->shown_count);
        $this->assertSame(1, $row->accepted_count);
        $this->assertEqualsWithDelta(25.0, (float) $row->accepted_revenue, 0.01);
    }

    public function test_each_surface_is_counted_separately(): void
    {
        $item = $this->item('Cross-surface');
        $tracker = app(SuggestionTracker::class);

        $tracker->record('cart', 'shown', [$item->id]);
        $tracker->record('item_sheet', 'shown', [$item->id]);
        $tracker->record('pos', 'accepted', [$item->id]);

        // Otherwise you cannot tell a panel that works on the till from one
        // that works in the cart, which is the whole point of measuring.
        $this->assertDatabaseCount('item_suggestion_stats', 3);
    }

    public function test_a_duplicate_in_one_payload_counts_once(): void
    {
        // Two anchors can nominate the same winner; the customer saw it once.
        $item = $this->item('Deduped');

        app(SuggestionTracker::class)->record('cart', 'shown', [$item->id, $item->id]);

        $this->assertSame(1, ItemSuggestionStat::query()->first()->shown_count);
    }

    public function test_unknown_surfaces_actions_and_items_are_ignored(): void
    {
        $item = $this->item('Real');
        $tracker = app(SuggestionTracker::class);

        $this->assertSame(0, $tracker->record('billboard', 'shown', [$item->id]));
        $this->assertSame(0, $tracker->record('cart', 'hovered', [$item->id]));
        // A stale client can post an id that has since been deleted; the
        // foreign key would otherwise reject the whole batch.
        $this->assertSame(0, $tracker->record('cart', 'shown', [999999]));

        $this->assertDatabaseCount('item_suggestion_stats', 0);
    }

    public function test_the_endpoint_records_without_auth_and_answers_accepted(): void
    {
        $item = $this->item('Endpoint');

        $this->postJson('/api/recommendations/track', [
            'surface' => 'cart',
            'action' => 'accepted',
            'item_ids' => [$item->id],
        ])->assertStatus(202)->assertJsonPath('recorded', 1);

        $this->assertDatabaseHas('item_suggestion_stats', [
            'item_id' => $item->id,
            'surface' => 'cart',
            'accepted_count' => 1,
        ]);
    }

    public function test_the_endpoint_rejects_a_surface_it_does_not_know(): void
    {
        $item = $this->item('Bad surface');

        $this->postJson('/api/recommendations/track', [
            'surface' => 'somewhere-else',
            'action' => 'shown',
            'item_ids' => [$item->id],
        ])->assertStatus(422);
    }

    public function test_the_admin_report_returns_take_rate_and_money(): void
    {
        $fries = $this->item('Report Fries', 25);
        $tracker = app(SuggestionTracker::class);

        for ($i = 0; $i < 10; $i++) {
            $tracker->record('cart', 'shown', [$fries->id]);
        }
        $tracker->record('cart', 'accepted', [$fries->id]);
        $tracker->record('cart', 'accepted', [$fries->id]);

        Sanctum::actingAs($this->analyst(), ['staff']);

        $response = $this->getJson('/api/admin/marketing/suggestion-performance?days=30')->assertOk();

        $response->assertJsonPath('data.0.item_name', 'Report Fries');
        $response->assertJsonPath('data.0.shown', 10);
        $response->assertJsonPath('data.0.accepted', 2);
        // 2 of 10 — the number that decides whether the slot is worth keeping.
        // Compared with a delta because JSON drops the trailing .0 on a round
        // percentage, and assertJsonPath compares strictly.
        $this->assertEqualsWithDelta(20.0, (float) $response->json('data.0.take_rate'), 0.01);
        $this->assertEqualsWithDelta(50.0, (float) $response->json('meta.revenue'), 0.01);
        $this->assertEqualsWithDelta(20.0, (float) $response->json('meta.take_rate'), 0.01);
    }

    public function test_the_admin_report_needs_the_analytics_permission(): void
    {
        $role = Role::firstOrCreate(['slug' => 'nobody'], ['name' => 'Nobody', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        $user = User::create([
            'name' => 'No Analytics',
            'email' => 'no-analytics@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);

        Sanctum::actingAs($user, ['staff']);

        $this->getJson('/api/admin/marketing/suggestion-performance')->assertForbidden();
    }

    private function analyst(): User
    {
        $role = Role::firstOrCreate(
            ['slug' => 'analyst'],
            ['name' => 'Analyst', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $role->permissions()->syncWithoutDetaching(
            \App\Models\Permission::query()->where('slug', 'customers.analytics')->pluck('id'),
        );

        return User::create([
            'name' => 'Suggestion Analyst',
            'email' => 'suggestion-analyst@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);
    }
}
