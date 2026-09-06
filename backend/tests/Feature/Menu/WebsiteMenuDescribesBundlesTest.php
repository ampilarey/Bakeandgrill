<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Models\Category;
use App\Models\ComboItem;
use App\Models\Item;
use App\Models\PlatterGroup;
use App\Models\PlatterGroupItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The website menu says what a bundle is.
 *
 * Owner's audit, 2026-09-06, F7: the order app listed a fixed bundle's
 * contents and offered the platter picker; the Blade menu showed a name and a
 * price, so somebody reading the website could not tell that "Mixed Platter"
 * is choose-your-own or what the family bundle contains.
 */
class WebsiteMenuDescribesBundlesTest extends TestCase
{
    use RefreshDatabase;

    private function category(): Category
    {
        return Category::firstOrCreate(['name' => 'Bundles'], ['is_active' => true]);
    }

    private function dish(string $name, float $price, array $over = []): Item
    {
        return Item::create(array_merge([
            'category_id' => $this->category()->id,
            'name' => $name,
            'base_price' => $price,
            'is_active' => true,
            'is_available' => true,
        ], $over));
    }

    /** @param list<array{0: Item, 1: int, 2?: bool}> $children */
    private function bundle(string $name, float $ownPrice, array $children, ?float $pct = null): Item
    {
        $combo = $this->dish($name, $ownPrice, [
            'is_combo' => true,
            'combo_discount_pct' => $pct,
        ]);

        foreach ($children as $row) {
            ComboItem::create([
                'combo_id' => $combo->id,
                'item_id' => $row[0]->id,
                'quantity' => $row[1],
                'is_optional' => $row[2] ?? false,
            ]);
        }

        return $combo->fresh();
    }

    /** @param list<Item> $choices */
    private function platter(string $name, float $price, array $choices, string $rule = 'exactly', int $count = 2): Item
    {
        $platter = $this->dish($name, $price, ['is_combo' => true]);
        $group = PlatterGroup::create([
            'item_id' => $platter->id,
            'name' => 'Pick your sides',
            'rule_type' => $rule,
            'min_count' => $count,
            'max_count' => $count,
            'sort_order' => 0,
        ]);
        foreach ($choices as $i => $choice) {
            PlatterGroupItem::create([
                'platter_group_id' => $group->id,
                'item_id' => $choice->id,
                'surcharge' => 0,
                'sort_order' => $i,
            ]);
        }

        return $platter->fresh();
    }

    public function test_an_item_page_lists_what_a_fixed_bundle_contains(): void
    {
        $burger = $this->dish('Beef Burger', 60);
        $fries = $this->dish('Masala Fries', 20);
        $combo = $this->bundle('Family Meal', 150, [[$burger, 1], [$fries, 2]]);

        $this->get('/menu/' . $combo->id)
            ->assertOk()
            ->assertSee('What’s inside', false)
            ->assertSee('Beef Burger')
            ->assertSee('Masala Fries')
            // Two portions of fries is not the same offer as one.
            ->assertSee('2×', false);
    }

    public function test_an_optional_child_is_marked_optional(): void
    {
        $burger = $this->dish('Beef Burger', 60);
        $sauce = $this->dish('Garlic Dip', 10);
        $combo = $this->bundle('Burger Deal', 70, [[$burger, 1], [$sauce, 1, true]]);

        $this->get('/menu/' . $combo->id)
            ->assertOk()
            ->assertSee('Garlic Dip')
            ->assertSee('optional');
    }

    public function test_a_bundle_discount_shows_the_saving_against_buying_separately(): void
    {
        // 60 + 2×20 = 100, less 20% = 80, so the saving is 20.
        $burger = $this->dish('Beef Burger', 60);
        $fries = $this->dish('Masala Fries', 20);
        $combo = $this->bundle('Family Meal', 999, [[$burger, 1], [$fries, 2]], pct: 20);

        $this->get('/menu/' . $combo->id)
            ->assertOk()
            ->assertSee('Save MVR 20.00')
            ->assertSee('MVR 100.00 bought separately');
    }

    public function test_a_bundle_without_a_discount_claims_no_saving(): void
    {
        // Its own price and its contents price are unrelated numbers; quoting
        // one against the other would invent a saving nobody offered.
        $burger = $this->dish('Beef Burger', 60);
        $combo = $this->bundle('Burger Deal', 55, [[$burger, 1]]);

        $this->get('/menu/' . $combo->id)
            ->assertOk()
            ->assertSee('Beef Burger')
            ->assertDontSee('bought separately');
    }

    public function test_an_item_page_says_a_platter_is_choose_your_own(): void
    {
        $rice = $this->dish('Fried Rice', 45);
        $noodles = $this->dish('Chow Mein', 45);
        $platter = $this->platter('Mixed Platter', 200, [$rice, $noodles]);

        $this->get('/menu/' . $platter->id)
            ->assertOk()
            ->assertSee('Choose your own')
            ->assertSee('Pick your sides')
            ->assertSee('Pick 2')
            ->assertSee('Fried Rice')
            ->assertSee('Chow Mein');
    }

    public function test_the_menu_grid_marks_bundles_and_platters(): void
    {
        $rice = $this->dish('Fried Rice', 45);
        $burger = $this->dish('Beef Burger', 60);
        $this->bundle('Family Meal', 150, [[$burger, 1]]);
        $this->platter('Mixed Platter', 200, [$rice]);

        $html = $this->get('/menu')->assertOk()->getContent();

        $this->assertStringContainsString('menu-card-bundle', $html);
        $this->assertStringContainsString('>Bundle<', $html);
        $this->assertStringContainsString('>Choose your own<', $html);
    }

    public function test_a_plain_dish_gets_no_bundle_markup(): void
    {
        $burger = $this->dish('Beef Burger', 60);

        $this->get('/menu/' . $burger->id)
            ->assertOk()
            ->assertDontSee('What’s inside', false)
            // The class name alone is no good — it is also a CSS rule in the
            // page's own inlined stylesheet, so it is there either way.
            ->assertDontSee('class="menu-item-bundle"', false);
    }

    public function test_a_bundle_is_searchable_by_what_is_in_it(): void
    {
        // The grid filters client-side off data-search, so the contents have
        // to be in the attribute for "chicken" to reach a bundle named for
        // nothing in particular.
        $chicken = $this->dish('Peri Peri Chicken', 90);
        $this->bundle('Family Meal', 150, [[$chicken, 1]]);

        $html = $this->get('/menu')->assertOk()->getContent();

        $this->assertMatchesRegularExpression(
            '/data-search="[^"]*peri peri chicken[^"]*"[^>]*data-name="family meal"/s',
            $html,
        );
    }

    public function test_an_inactive_child_is_not_advertised(): void
    {
        // It is not on the menu, so listing it promises food nobody can make.
        $burger = $this->dish('Beef Burger', 60);
        $retired = $this->dish('Discontinued Wrap', 40, ['is_active' => false]);
        $combo = $this->bundle('Family Meal', 150, [[$burger, 1], [$retired, 1]]);

        $this->get('/menu/' . $combo->id)
            ->assertOk()
            ->assertSee('Beef Burger')
            ->assertDontSee('Discontinued Wrap');
    }
}
