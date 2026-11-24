<?php

declare(strict_types=1);

namespace Tests\Feature\Ai;

use App\Domains\Ai\AiSuggestions;
use App\Domains\Ai\Assistant;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AiSuggestion;
use App\Models\Category;
use App\Models\InventoryCategory;
use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-11-24: "since menu is public add admin approval. And can add automatic
 * dhivehi and rest of the possible automatic updates?" The assistant proposes by itself;
 * nothing changes until a person approves it.
 */
class AiSuggestionsTest extends TestCase
{
    use RefreshDatabase;

    public static int $asks = 0;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        self::$asks = 0;
    }

    /** An assistant that answers each job by the shape it was asked for. */
    private function assistant(callable $answer): void
    {
        $this->app->instance(Assistant::class, new class($answer) extends Assistant
        {
            /** @param callable $answer */
            public function __construct(private $answer) {}

            public function ready(): bool
            {
                return true;
            }

            public function ask(string $instructions, string $prompt, array $schema, ?array $file = null, int $timeout = 60, int $maxTokens = 4000): array
            {
                AiSuggestionsTest::$asks++;

                return ($this->answer)(json_decode($prompt, true), $instructions);
            }
        });
    }

    public function test_dhivehi_for_a_dish_waits_and_goes_on_the_menu_only_when_approved(): void
    {
        $momo = Item::factory()->create(['name' => 'Chicken Momo', 'name_dv' => null, 'short_description' => 'Steamed dumplings', 'is_active' => true]);
        $done = Item::factory()->create(['name' => 'Bajiya', 'name_dv' => 'ބާޖިޔާ', 'is_active' => true]);
        $this->assistant(fn (array $dishes) => ['rows' => array_map(fn ($d) => ['id' => $d['id'], 'name_dv' => 'ކުކުޅު މޯމޯ', 'short_dv' => 'ދޮންކޮށްފައި'], $dishes)]);

        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'menu_dhivehi'])->assertOk()->assertJsonPath('made', 1);
        $this->assertNull($momo->fresh()->name_dv, 'proposed, not applied');
        $this->assertSame(0, AiSuggestion::query()->where('subject_id', $done->id)->count(), 'a dish that has its Dhivehi is left alone');

        // Asked again, the dish that is waiting is not proposed twice.
        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'menu_dhivehi'])->assertOk()->assertJsonPath('made', 0);

        $list = $this->getJson('/api/admin/ai/suggestions')->assertOk()->json('kinds');
        $row = collect($list)->firstWhere('key', 'menu_dhivehi')['rows'][0];
        $this->assertSame('Chicken Momo', $row['subject']);

        // Approved with the person's own wording for the name.
        $this->postJson('/api/admin/ai/suggestions/decide', ['approve' => [$row['id']], 'edits' => [$row['id'] => ['name_dv' => 'ކުކުޅު މޯމޯސް']]])
            ->assertOk()->assertJson(['approved' => 1]);
        $this->assertSame('ކުކުޅު މޯމޯސް', $momo->fresh()->name_dv);
        $this->assertSame('ދޮންކޮށްފައި', $momo->fresh()->short_description_dv);
    }

    public function test_a_dish_changed_since_is_left_alone_and_a_refusal_is_remembered(): void
    {
        $mains = Category::create(['name' => 'Mains', 'slug' => 'mains', 'is_active' => true]);
        $drinks = Category::create(['name' => 'Drinks', 'slug' => 'drinks', 'is_active' => true]);
        $juice = Item::factory()->create(['name' => 'Mango Juice', 'category_id' => $mains->id, 'is_active' => true]);
        $cola = Item::factory()->create(['name' => 'Cola', 'category_id' => $mains->id, 'is_active' => true]);
        $this->assistant(fn (array $in) => ['rows' => array_map(fn ($d) => ['id' => $d['id'], 'to' => $drinks->id, 'why' => 'A drink'], $in['dishes'])]);

        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'menu_category'])->assertOk()->assertJsonPath('made', 2);
        $forJuice = AiSuggestion::query()->where('subject_id', $juice->id)->firstOrFail();
        $forCola = AiSuggestion::query()->where('subject_id', $cola->id)->firstOrFail();
        $this->assertSame('Mains', $forJuice->before['category']);

        // Someone moves the juice by hand meanwhile: the suggestion goes stale, the dish is untouched.
        $snacks = Category::create(['name' => 'Snacks', 'slug' => 'snacks', 'is_active' => true]);
        $juice->update(['category_id' => $snacks->id]);
        $this->postJson('/api/admin/ai/suggestions/decide', ['approve' => [$forJuice->id], 'reject' => [$forCola->id]])->assertOk()->assertJson(['stale' => 1, 'rejected' => 1]);
        $this->assertSame($snacks->id, $juice->fresh()->category_id);
        $this->assertSame($mains->id, $cola->fresh()->category_id);

        // Turned down: not proposed again.
        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'menu_category'])->assertOk();
        $this->assertSame(1, AiSuggestion::query()->where('subject_id', $cola->id)->count());
    }

    public function test_a_sections_order_is_set_only_on_approval_and_must_name_every_dish(): void
    {
        $momo = Category::create(['name' => 'Momo', 'slug' => 'momo', 'is_active' => true]);
        $ids = [];
        foreach (['Fried Momo', 'Chilli Momo', 'Steamed Momo', 'Jhol Momo'] as $n => $name) {
            $ids[] = Item::factory()->create(['name' => $name, 'category_id' => $momo->id, 'sort_order' => $n, 'is_active' => true])->id;
        }
        $want = [$ids[2], $ids[0], $ids[3], $ids[1]];
        $this->assistant(fn () => ['rows' => [['section' => $momo->id, 'ids' => $want, 'why' => 'Plain before spicy']]]);
        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'menu_order'])->assertOk()->assertJsonPath('made', 1);
        $this->assertSame($ids, Item::query()->where('category_id', $momo->id)->orderBy('sort_order')->pluck('id')->all(), 'the menu is as it was');

        $s = AiSuggestion::query()->where('kind', 'menu_order')->firstOrFail();
        $this->assertSame(['Steamed Momo', 'Fried Momo', 'Jhol Momo', 'Chilli Momo'], $s->proposed['names']);
        $this->postJson('/api/admin/ai/suggestions/decide', ['approve' => [$s->id]])->assertOk()->assertJson(['approved' => 1]);
        $this->assertSame($want, Item::query()->where('category_id', $momo->id)->orderBy('sort_order')->pluck('id')->all());

        // An answer that leaves a dish out is not kept.
        AiSuggestion::query()->delete();
        $this->assistant(fn () => ['rows' => [['section' => $momo->id, 'ids' => [$ids[0], $ids[1]], 'why' => 'x']]]);
        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'menu_order'])->assertOk()->assertJsonPath('made', 0);
    }

    public function test_inventory_gets_a_category_and_look_alikes_are_only_pointed_out(): void
    {
        $dairy = InventoryCategory::create(['name' => 'Dairy', 'slug' => 'dairy', 'is_active' => true]);
        $butter = InventoryItem::create(['name' => 'Butter', 'unit' => 'kg', 'unit_cost' => 10, 'is_active' => true]);
        $butter2 = InventoryItem::create(['name' => 'Buttr 500g', 'unit' => 'kg', 'unit_cost' => 10, 'is_active' => true]);
        $this->assistant(fn (array $in) => isset($in['categories'])
            ? ['rows' => [['id' => $butter->id, 'category' => $dairy->id], ['id' => $butter2->id, 'category' => 999]]]
            : ['rows' => [['a' => $butter2->id, 'b' => $butter->id, 'why' => 'Same product, misspelt'], ['a' => $butter->id, 'b' => $butter->id, 'why' => 'itself']]]);

        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'inventory_category'])->assertOk()->assertJsonPath('made', 1);
        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'inventory_duplicate'])->assertOk()->assertJsonPath('made', 1);

        $cat = AiSuggestion::query()->where('kind', 'inventory_category')->firstOrFail();
        $dup = AiSuggestion::query()->where('kind', 'inventory_duplicate')->firstOrFail();
        $this->postJson('/api/admin/ai/suggestions/decide', ['approve' => [$cat->id, $dup->id]])->assertOk()->assertJson(['approved' => 1, 'rejected' => 1]);
        $this->assertSame($dairy->id, $butter->fresh()->inventory_category_id);
        $this->assertSame(2, InventoryItem::query()->count(), 'nothing is merged');
    }

    public function test_each_kind_asks_its_screens_permission_and_its_switch(): void
    {
        Item::factory()->create(['name' => 'Chicken Momo', 'name_dv' => null, 'is_active' => true]);
        $this->assistant(fn (array $d) => ['rows' => array_map(fn ($x) => ['id' => $x['id'], 'name_dv' => 'މޯމޯ', 'short_dv' => ''], $d)]);
        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'menu_dhivehi'])->assertOk();
        $s = AiSuggestion::query()->firstOrFail();

        // Someone without the menu's permission sees no menu suggestions and cannot decide them.
        $role = Role::query()->firstOrCreate(['slug' => 'staff'], ['name' => 'Staff']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['staff']);
        $this->assertSame([], $this->getJson('/api/admin/ai/suggestions')->assertOk()->json('kinds'));
        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'menu_dhivehi'])->assertForbidden();
        $this->postJson('/api/admin/ai/suggestions/decide', ['approve' => [$s->id]])->assertOk()->assertJson(['approved' => 0]);
        $this->assertSame('pending', $s->fresh()->status);

        // The switch off: the nightly look asks nothing.
        SiteSetting::set('ai_feature_auto_menu', '0');
        SiteSetting::set('ai_feature_auto_inventory', '0');
        SiteSetting::set('ai_feature_auto_labels', '0');
        self::$asks = 0;
        $this->artisan('ai:suggest')->assertSuccessful();
        $this->assertSame(0, self::$asks);
        $this->assertSame(1, AiSuggestions::waiting('menu.manage'));
    }
}
