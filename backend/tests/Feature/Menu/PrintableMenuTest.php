<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Models\Category;
use App\Models\Item;
use App\Models\Variant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The menu on paper.
 *
 * Owner, 2026-09-05: "make a print option. Make different options. Short
 * version, details ect."
 *
 * Three layouts off one page. What these tests hold is mostly about what must
 * *not* reach the paper — the toolbar, a cost price, a sized item advertised
 * at 0.00 — and the one deliberate difference from /menu: a printed sheet
 * outlives tonight's sold-out flag.
 */
class PrintableMenuTest extends TestCase
{
    use RefreshDatabase;

    private function category(string $name = 'Bondibai'): Category
    {
        return Category::firstOrCreate(['name' => $name], ['is_active' => true, 'sort_order' => 0]);
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

    private function sized(string $name, array $sizes): Item
    {
        $item = $this->dish($name, 0, ['has_variants' => true]);
        $order = 0;
        foreach ($sizes as $sizeName => $price) {
            Variant::create([
                'item_id' => $item->id,
                'name' => $sizeName,
                'price' => $price,
                'is_active' => true,
                'sort_order' => $order++,
            ]);
        }

        return $item->fresh();
    }

    public function test_the_print_page_lists_the_menu(): void
    {
        $this->dish('Mas Huni', 35);

        $this->get('/menu/print')
            ->assertOk()
            ->assertSee('Mas Huni')
            ->assertSee('35.00');
    }

    public function test_it_offers_the_three_layouts(): void
    {
        $this->dish('Mas Huni', 35);

        $this->get('/menu/print')
            ->assertOk()
            ->assertSee('Short list')
            ->assertSee('With details')
            ->assertSee('Large / wall');
    }

    public function test_an_unknown_layout_falls_back_rather_than_erroring(): void
    {
        // A pasted or edited URL should print something, not a 500.
        $this->dish('Mas Huni', 35);

        $this->get('/menu/print?style=nonsense')
            ->assertOk()
            ->assertSee('style-short', false);
    }

    public function test_the_short_layout_leaves_descriptions_off(): void
    {
        $this->dish('Mas Huni', 35, ['description' => 'Tuna, coconut and onion']);

        $res = $this->get('/menu/print?style=short')->assertOk();

        $res->assertSee('Mas Huni');
        $res->assertDontSee('Tuna, coconut and onion');
    }

    public function test_the_detailed_layout_carries_the_description(): void
    {
        $this->dish('Mas Huni', 35, ['description' => 'Tuna, coconut and onion']);

        $this->get('/menu/print?style=full')
            ->assertOk()
            ->assertSee('Tuna, coconut and onion');
    }

    public function test_every_size_prints_with_its_own_price(): void
    {
        // The whole point of a price list: somebody has to read off what a
        // Large costs, not "from 20.00".
        $this->sized('Bondibai', ['Small' => 20, 'Medium' => 40]);

        $res = $this->get('/menu/print')->assertOk();

        $res->assertSee('Small');
        $res->assertSee('20.00');
        $res->assertSee('Medium');
        $res->assertSee('40.00');
    }

    public function test_a_sized_item_never_prints_as_zero(): void
    {
        // A sized item carries base_price 0. Printing that would put "0.00"
        // on the paper next to a dish that costs forty rufiyaa.
        $this->sized('Bondibai', ['Small' => 20, 'Medium' => 40]);

        $this->get('/menu/print')->assertOk()->assertDontSee('0.00</span>', false);
    }

    public function test_a_dish_sold_out_today_still_prints(): void
    {
        /*
         * The deliberate difference from /menu. A printed sheet outlives
         * today: dropping tonight's 86'd dish would quietly reprint the menu
         * without it, and putting it back tomorrow means printing again.
         */
        $this->dish('Mas Huni', 35, ['is_available' => false]);

        $this->get('/menu/print')->assertOk()->assertSee('Mas Huni');
    }

    public function test_a_dish_taken_off_the_menu_does_not_print(): void
    {
        // Inactive is "we do not sell this", which is exactly what should not
        // reach a customer's hands on paper.
        $this->dish('Retired Dish', 35, ['is_active' => false]);

        $this->get('/menu/print')->assertOk()->assertDontSee('Retired Dish');
    }

    public function test_the_toolbar_is_marked_so_it_is_never_printed(): void
    {
        $this->dish('Mas Huni', 35);

        $res = $this->get('/menu/print')->assertOk();

        $res->assertSee('class="toolbar no-print"', false);
        $res->assertSee('.no-print { display: none !important; }', false);
    }

    public function test_the_sheet_is_not_offered_to_search_engines(): void
    {
        // It is the same menu Google already has at /menu, in a layout meant
        // for paper.
        $this->dish('Mas Huni', 35);

        $this->get('/menu/print')->assertOk()->assertSee('name="robots" content="noindex"', false);
    }

    public function test_dhivehi_names_are_off_until_asked_for(): void
    {
        $this->dish('Mas Huni', 35, ['name_dv' => 'މަސްހުނި']);

        $this->get('/menu/print')->assertOk()->assertDontSee('މަސްހުނި');
        $this->get('/menu/print?dv=1')->assertOk()->assertSee('މަސްހުނި');
    }

    public function test_it_prints_nothing_rather_than_breaking_on_an_empty_menu(): void
    {
        $this->get('/menu/print')
            ->assertOk()
            ->assertSee('Nothing on the menu to print yet.');
    }

    public function test_cost_price_never_reaches_the_paper(): void
    {
        // The page is public. Anything the kitchen pays must stay off it.
        $this->dish('Mas Huni', 35, ['cost' => 12.34]);

        $this->get('/menu/print')->assertOk()->assertDontSee('12.34');
    }
}
