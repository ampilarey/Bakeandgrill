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

            public function ask(string $instructions, string $prompt, array $schema, ?array $file = null, int $timeout = 60, int $maxTokens = 4000, ?string $provider = null): array
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

    /**
     * Owner, 2026-11-24: "When i click look now, it should look in to all the items listed and all the
     * category and subcategory and suggest new category and subcategory and items belong to them".
     */
    public function test_look_now_goes_through_the_whole_menu_and_proposes_sections_and_sub_sections(): void
    {
        $snacks = Category::factory()->create(['name' => 'Snacks', 'parent_id' => null, 'is_active' => true]);
        $drinks = Category::factory()->create(['name' => 'Drinks', 'parent_id' => null, 'is_active' => true]);
        $hot = Category::factory()->create(['name' => 'Hot', 'parent_id' => $drinks->id, 'is_active' => true]);
        $dish = fn (string $name, ?Category $c, bool $on = true) => Item::factory()->create(['name' => $name, 'category_id' => $c?->id, 'is_active' => $on]);
        $momo = [$dish('Chicken Momo', $snacks), $dish('Beef Momo', $snacks), $dish('Veg Momo', $snacks), $dish('Jhol Momo', $snacks)];
        $bajiya = $dish('Bajiya', $snacks);
        $tea = $dish('Black Tea', $hot);
        // In no section, and switched off: both are part of "all the items listed".
        $cake = $dish('Chocolate Cake', null);
        $tart = $dish('Fruit Tart', null, false);
        $pops = [$dish('Mango Pop', null), $dish('Lime Pop', null)];
        $ids = array_map(fn (Item $i) => $i->id, $momo);

        $seen = null;
        $this->assistant(function (array $asked) use (&$seen, $snacks, $drinks, $ids, $bajiya, $tea, $cake, $tart, $pops) {
            $seen = $asked;

            return ['rows' => [
                ['name' => 'Momo', 'parent' => $snacks->id, 'parent_new' => '', 'ids' => $ids, 'why' => 'Four momo dishes together'],
                ['name' => 'Desserts', 'parent' => 0, 'parent_new' => '', 'ids' => [$cake->id, $tart->id], 'why' => 'They are in no section'],
                ['name' => 'Ice Pops', 'parent' => 0, 'parent_new' => 'Frozen Treats', 'ids' => [$pops[0]->id, $pops[1]->id], 'why' => 'A sub-section of a new section'],
                // Refused before it is kept: a section we have under that parent, one dish only, a parent that is not a main section, a dish already placed.
                ['name' => 'hot', 'parent' => $drinks->id, 'parent_new' => '', 'ids' => [$tea->id, $bajiya->id], 'why' => ''],
                ['name' => 'Teas', 'parent' => $drinks->id, 'parent_new' => '', 'ids' => [$tea->id], 'why' => ''],
                ['name' => 'Elsewhere', 'parent' => 9999, 'parent_new' => '', 'ids' => [$bajiya->id, $tea->id], 'why' => ''],
                ['name' => 'More Momo', 'parent' => $snacks->id, 'parent_new' => '', 'ids' => [$ids[0], $ids[1]], 'why' => ''],
            ]];
        });

        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'menu_section'])->assertOk()
            ->assertJsonPath('made', 3)->assertJsonPath('note', 'Looked at ' . Item::query()->count() . ' dishes and ' . Category::query()->count() . ' sections.');
        // Everything was shown to it: every dish with where it is, every section with its parent.
        $this->assertCount(Item::query()->count(), $seen['dishes']);
        $this->assertGreaterThanOrEqual(10, count($seen['dishes']));
        $this->assertContains(['id' => $cake->id, 'name' => 'Chocolate Cake', 'in' => 0], $seen['dishes']);
        $this->assertContains(['id' => $hot->id, 'name' => 'Hot', 'parent' => $drinks->id], $seen['sections']);
        $this->assertSame(0, Category::query()->whereIn('name', ['Momo', 'Desserts', 'Ice Pops', 'Frozen Treats'])->count(), 'proposed, not made');

        $rows = AiSuggestion::query()->where('kind', 'menu_section')->get()->keyBy('subject_label');
        $this->assertSame('Snacks', $rows['Momo']->proposed['parent']);
        $this->assertNull($rows['Desserts']->proposed['parent']);
        $this->assertTrue($rows['Ice Pops']->proposed['parent_is_new']);
        $this->assertSame('no section', $rows['Desserts']->proposed['items'][0]['in']);

        // One momo was moved by hand meanwhile, one is unticked, and the name is the person's own.
        $momo[3]->update(['category_id' => $drinks->id]);
        $this->postJson('/api/admin/ai/suggestions/decide', [
            'approve' => [$rows['Momo']->id, $rows['Desserts']->id, $rows['Ice Pops']->id],
            'edits' => [$rows['Momo']->id => ['name' => 'Momos', 'skip' => (string) $momo[2]->id]],
        ])->assertOk()->assertJsonPath('approved', 3);

        $made = Category::query()->where('name', 'Momos')->sole();
        $this->assertSame($snacks->id, $made->parent_id);
        $this->assertSame($made->id, $momo[0]->fresh()->category_id);
        $this->assertSame($snacks->id, $momo[2]->fresh()->category_id, 'unticked');
        $this->assertSame($drinks->id, $momo[3]->fresh()->category_id, 'moved by hand since: left where it was put');
        $desserts = Category::query()->where('name', 'Desserts')->sole();
        $this->assertNull($desserts->parent_id);
        $this->assertSame($desserts->id, $cake->fresh()->category_id);
        $this->assertSame($desserts->id, $tart->fresh()->category_id);
        // The sub-section's new main section was made with it.
        $frozen = Category::query()->where('name', 'Frozen Treats')->sole();
        $this->assertNull($frozen->parent_id);
        $this->assertSame($frozen->id, Category::query()->where('name', 'Ice Pops')->sole()->parent_id);
        $this->assertSame($snacks->id, $bajiya->fresh()->category_id);
    }

    public function test_a_new_look_replaces_the_plan_and_a_section_turned_down_stays_down(): void
    {
        $snacks = Category::factory()->create(['name' => 'Snacks', 'parent_id' => null, 'is_active' => true]);
        $items = [];
        foreach (['Chicken Roll', 'Fish Roll', 'Egg Roll', 'Bajiya', 'Gulha', 'Cutlet'] as $n) {
            $items[] = Item::factory()->create(['name' => $n, 'category_id' => $snacks->id, 'is_active' => true]);
        }
        $rolls = ['name' => 'Rolls', 'parent' => $snacks->id, 'parent_new' => '', 'ids' => [$items[0]->id, $items[1]->id, $items[2]->id], 'why' => ''];
        $fried = ['name' => 'Fried', 'parent' => $snacks->id, 'parent_new' => '', 'ids' => [$items[3]->id, $items[4]->id, $items[5]->id], 'why' => ''];
        $this->assistant(fn () => ['rows' => [$rolls, $fried]]);

        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'menu_section'])->assertJsonPath('made', 2);
        $first = AiSuggestion::query()->where('kind', 'menu_section')->where('subject_label', 'Rolls')->sole();
        $this->postJson('/api/admin/ai/suggestions/decide', ['reject' => [$first->id]])->assertJsonPath('rejected', 1);

        // Asked again: the plan that was waiting gives way to the new one, and Rolls is not offered again.
        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'menu_section'])->assertJsonPath('made', 1);
        $this->assertSame(1, AiSuggestion::query()->where('kind', 'menu_section')->where('status', 'pending')->count());
        // The nightly run leaves a plan that is waiting alone, and costs nothing.
        $asks = self::$asks;
        $this->assertSame(0, app(AiSuggestions::class)->look('menu_section', asked: false));
        $this->assertSame($asks, self::$asks);

        // The owner made "fried" by hand meanwhile: that one is filled, no second made.
        $again = AiSuggestion::query()->where('kind', 'menu_section')->where('status', 'pending')->sole();
        $own = Category::factory()->create(['name' => 'fried', 'parent_id' => $snacks->id, 'is_active' => true]);
        $this->postJson('/api/admin/ai/suggestions/decide', ['approve' => [$again->id]])->assertJsonPath('approved', 1);
        $this->assertSame(1, Category::query()->where('parent_id', $snacks->id)->count());
        $this->assertSame($own->id, $items[3]->fresh()->category_id);
    }

    /**
     * Owner, 2026-11-24: "Is there any way to upload recommended menu and category so api can rethink
     * about that before suggestions" → "File upload" → "Both".
     */
    public function test_the_owners_plan_for_the_menu_is_kept_and_handed_to_the_look(): void
    {
        $snacks = Category::factory()->create(['name' => 'Snacks', 'parent_id' => null, 'is_active' => true]);
        $a = Item::factory()->create(['name' => 'Chicken Momo', 'category_id' => $snacks->id]);
        $b = Item::factory()->create(['name' => 'Beef Momo', 'category_id' => $snacks->id]);
        $told = '';
        // One stand-in for the whole test: a route keeps the controller it first made.
        $read = "Desserts\n  Cakes";
        $this->assistant(function (?array $asked, string $instructions) use (&$told, &$read, $snacks, $a, $b) {
            if ($asked === null) {
                return ['text' => $read];
            }
            $told = $instructions;

            return ['rows' => [['name' => 'Dumplings', 'parent' => $snacks->id, 'parent_new' => '', 'ids' => [$a->id, $b->id], 'why' => 'As the plan says']]];
        });

        $this->getJson('/api/admin/ai/menu-plan')->assertOk()->assertJsonPath('plan', '');
        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'menu_section'])->assertOk();
        $this->assertStringNotContainsString("The owner's plan:", $told);

        $this->putJson('/api/admin/ai/menu-plan', ['plan' => "Snacks\n  Dumplings\n  Rolls\n"])->assertOk()->assertJsonPath('plan', "Snacks\n  Dumplings\n  Rolls");
        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'menu_section'])->assertOk()->assertJsonPath('made', 1)
            ->assertJsonPath('note', 'Looked at ' . Item::query()->count() . ' dishes and ' . Category::query()->count() . ' sections. Your plan for the menu was followed.');
        $this->assertStringContainsString("The owner's plan:\nSnacks\n  Dumplings\n  Rolls", $told);

        // A text file is read as it is, with no assistant; a picture is read by the assistant; neither is saved.
        $asks = self::$asks;
        $this->post('/api/admin/ai/menu-plan/read', ['file' => \Illuminate\Http\UploadedFile::fake()->createWithContent('plan.txt', "Drinks\r\n  Juices\r\n")], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('plan', "Drinks\n  Juices");
        $this->assertSame($asks, self::$asks);
        $this->post('/api/admin/ai/menu-plan/read', ['file' => \Illuminate\Http\UploadedFile::fake()->image('plan.jpg', 40, 40)], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('plan', "Desserts\n  Cakes");
        $read = '';
        $this->post('/api/admin/ai/menu-plan/read', ['file' => \Illuminate\Http\UploadedFile::fake()->image('cat.jpg', 40, 40)], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonPath('message', 'The assistant could not read a menu plan from this file.');
        $this->getJson('/api/admin/ai/menu-plan')->assertJsonPath('plan', "Snacks\n  Dumplings\n  Rolls");

        // Owner, 2026-11-24: "Couldn't upload the excel file". A sheet is read here, with no assistant: a column further right sits under the row above.
        $book = new \PhpOffice\PhpSpreadsheet\Spreadsheet;
        $book->getActiveSheet()->fromArray([['Snacks'], [null, 'Momo'], [null, null, 'Chicken Momo', 45], [null, 'Rolls'], [], ['Drinks'], [null, 'Fresh  juices']], null, 'B2');
        $path = tempnam(sys_get_temp_dir(), 'plan') . '.xlsx';
        (new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($book))->save($path);
        $asks = self::$asks;
        $this->post('/api/admin/ai/menu-plan/read', ['file' => new \Illuminate\Http\UploadedFile($path, 'My menu.xlsx', null, null, true)], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('plan', "Snacks\n  Momo\n    Chicken Momo, 45\n  Rolls\nDrinks\n  Fresh juices");
        $this->assertSame($asks, self::$asks);
        @unlink($path);
        // An empty sheet and a kind of file nothing reads both say so in words.
        $empty = tempnam(sys_get_temp_dir(), 'plan') . '.xlsx';
        (new \PhpOffice\PhpSpreadsheet\Writer\Xlsx(new \PhpOffice\PhpSpreadsheet\Spreadsheet))->save($empty);
        $this->post('/api/admin/ai/menu-plan/read', ['file' => new \Illuminate\Http\UploadedFile($empty, 'empty.xlsx', null, null, true)], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonPath('message', 'Nothing could be read from this Excel file. Check it has the sections typed in its cells, or save it as PDF and upload that.');
        @unlink($empty);
        $this->post('/api/admin/ai/menu-plan/read', ['file' => \Illuminate\Http\UploadedFile::fake()->create('plan.zip', 4, 'application/zip')], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonPath('message', 'This kind of file cannot be read. Use an Excel file, a PDF, a photo or a text file.');

        // Emptied, the look decides by itself again. Someone who may not change the menu has no plan to read or write.
        $this->putJson('/api/admin/ai/menu-plan', ['plan' => ''])->assertOk()->assertJsonPath('plan', '');
        Sanctum::actingAs(User::factory()->create(['role_id' => Role::query()->firstOrCreate(['slug' => 'staff'], ['name' => 'Staff'])->id]), ['staff']);
        $this->getJson('/api/admin/ai/menu-plan')->assertForbidden();
        $this->putJson('/api/admin/ai/menu-plan', ['plan' => 'x'])->assertForbidden();
    }

    /** Owner, 2026-11-24: "is there any way to check for duplicate items". */
    public function test_dishes_that_look_alike_are_pointed_out_and_never_merged(): void
    {
        $snacks = Category::factory()->create(['name' => 'Snacks', 'is_active' => true]);
        $one = Item::factory()->create(['name' => 'Chicken Momo', 'category_id' => $snacks->id, 'base_price' => 45, 'is_active' => true]);
        $two = Item::factory()->create(['name' => 'Chiken Momos', 'category_id' => null, 'base_price' => 45, 'is_active' => false]);
        $beef = Item::factory()->create(['name' => 'Beef Momo', 'category_id' => $snacks->id, 'is_active' => true]);
        $seen = null;
        $this->assistant(function (array $asked) use (&$seen, $one, $two, $beef) {
            $seen = $asked;

            return ['rows' => [
                ['a' => $two->id, 'b' => $one->id, 'why' => 'Same dish, two spellings'],
                ['a' => $one->id, 'b' => $two->id, 'why' => 'The same pair again'],
                ['a' => $beef->id, 'b' => $beef->id, 'why' => 'Itself'],
                ['a' => $beef->id, 'b' => 999999, 'why' => 'Not a dish'],
            ]];
        });

        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'menu_duplicate'])->assertOk()->assertJsonPath('made', 1);
        // The dish switched off and the one in no section are looked at too, and said to be so.
        $this->assertContains(['id' => $two->id, 'name' => 'Chiken Momos (switched off)', 'section' => 'no section', 'price' => 45], $seen);
        $row = AiSuggestion::query()->where('kind', 'menu_duplicate')->sole();
        $this->assertSame($one->id, $row->subject_id);
        $this->assertSame($two->id, $row->proposed['other_id']);
        $this->assertSame('Snacks', $row->before['section']);

        // Approve does nothing to either dish: it can only be dismissed, and is then not pointed out again.
        $this->postJson('/api/admin/ai/suggestions/decide', ['approve' => [$row->id]])->assertOk()->assertJsonPath('rejected', 1);
        $this->assertNotNull($one->fresh());
        $this->assertNotNull($two->fresh());
        $this->postJson('/api/admin/ai/suggestions/look', ['kind' => 'menu_duplicate'])->assertOk()->assertJsonPath('made', 0);
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
