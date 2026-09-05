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

    private function setLogo(string $value): void
    {
        \App\Models\SiteSetting::updateOrCreate(['key' => 'logo'], [
            'value' => $value,
            'type' => 'text',
            'group' => 'Branding',
            'label' => 'logo',
            'is_public' => true,
        ]);
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

    public function test_an_item_whose_category_is_switched_off_still_prints(): void
    {
        /*
         * The 500 on the live site. `groupByParent` puts items with no *active*
         * category into a bucket whose `category` is null — the website menu
         * heads that "More" — and the print sheet read `->name` off it. Every
         * test here had given its items a live category, so nothing caught it.
         */
        $retired = Category::create(['name' => 'Old Section', 'is_active' => false]);
        $this->dish('Orphan Dish', 20, ['category_id' => $retired->id]);

        $this->get('/menu/print')
            ->assertOk()
            ->assertSee('Orphan Dish')
            ->assertSee('More');
    }

    public function test_an_item_with_no_category_at_all_still_prints(): void
    {
        $this->dish('Uncategorised Dish', 20, ['category_id' => null]);

        $this->get('/menu/print')->assertOk()->assertSee('Uncategorised Dish');
    }

    public function test_the_sheet_carries_the_brand_and_a_qr_to_the_live_menu(): void
    {
        // Owner, 2026-09-05: "Add logo. Make visual." The QR is the part that
        // matters most: a printed price list ages, and this is the copy on it
        // that never does.
        $this->dish('Mas Huni', 35);

        $res = $this->get('/menu/print')->assertOk();

        $res->assertSee('<img class="masthead__logo"', false);
        $res->assertSee('data:image/svg+xml;base64,', false);
        $res->assertSee('prices may change');
    }

    public function test_a_missing_logo_file_does_not_break_the_sheet(): void
    {
        // The logo is read off disk so dompdf never has to fetch our own site
        // to build a PDF. A path that is not there simply prints no logo.
        $this->setLogo('/storage/gone.png');
        $this->dish('Mas Huni', 35);

        // The class name is also a CSS rule, so assert on the tag itself.
        $this->get('/menu/print')->assertOk()->assertDontSee('<img class="masthead__logo"', false);
    }

    public function test_a_remote_logo_url_is_not_fetched(): void
    {
        // Embedding it would mean an HTTP request out of the box while
        // rendering, which fails quietly behind a firewall and turns the
        // masthead into a broken image.
        $this->setLogo('https://example.com/logo.png');
        $this->dish('Mas Huni', 35);

        $this->get('/menu/print')->assertOk()->assertDontSee('example.com/logo.png');
    }

    public function test_the_page_offers_the_pdf(): void
    {
        $this->dish('Mas Huni', 35);

        $this->get('/menu/print?style=full')
            ->assertOk()
            ->assertSee('menu/print.pdf?style=full', false);
    }

    public function test_the_pdf_downloads_and_is_a_pdf(): void
    {
        $this->dish('Mas Huni', 35);

        $res = $this->get('/menu/print.pdf');

        $res->assertOk();
        $this->assertSame('application/pdf', $res->headers->get('content-type'));
        $this->assertStringContainsString('attachment', (string) $res->headers->get('content-disposition'));
        $this->assertStringStartsWith('%PDF-', $res->getContent());
    }

    public function test_the_pdf_is_named_for_the_shop_and_the_day(): void
    {
        $this->dish('Mas Huni', 35);

        $disposition = (string) $this->get('/menu/print.pdf')->assertOk()
            ->headers->get('content-disposition');

        $this->assertStringContainsString('-menu-' . now()->format('Y-m-d') . '.pdf', $disposition);
    }

    public function test_the_pdf_honours_the_layout_it_was_asked_for(): void
    {
        $this->dish('Mas Huni', 35, ['description' => 'Tuna, coconut and onion']);

        $short = $this->get('/menu/print.pdf?style=short')->assertOk()->getContent();
        $full = $this->get('/menu/print.pdf?style=full')->assertOk()->getContent();

        // The detailed layout carries descriptions, so it is the larger file.
        $this->assertGreaterThan(strlen($short), strlen($full));
    }

    public function test_the_pdf_carries_no_toolbar(): void
    {
        // Nobody can click "Print" inside a PDF, and a row of buttons across
        // the top of a menu somebody was sent would look like a mistake.
        $this->dish('Mas Huni', 35);

        $this->assertStringNotContainsString(
            'toolbar',
            $this->get('/menu/print.pdf')->assertOk()->getContent(),
        );
    }

    public function test_the_sheet_reflows_for_a_phone(): void
    {
        /*
         * Owner, 2026-09-06: "Still print mobile view need enhancements." At
         * 390px the short list's two columns collided — a long dish name
         * cannot wrap when its row is `nowrap`, so it ran straight through the
         * next column — and the wall layout pushed the page sideways.
         */
        $this->dish('Mas Huni', 35);

        $html = $this->get('/menu/print')->assertOk()->getContent();

        $this->assertStringContainsString('@media screen and (max-width: 700px)', $html);
        $this->assertStringContainsString('.style-short .body { column-count: 1; }', $html);
    }

    public function test_the_phone_rules_never_reach_the_pdf(): void
    {
        /*
         * The reason the block is cut out in Blade rather than left to the
         * media query: dompdf treats the document as screen media and does not
         * evaluate width conditions, so a mobile block that reached it would
         * quietly reformat every PDF anyone was sent.
         */
        $this->dish('Mas Huni', 35);

        $rendered = view('menu-print', array_merge(
            $this->printViewData(),
            ['forPdf' => true],
        ))->render();

        $this->assertStringNotContainsString('max-width: 700px', $rendered);
        $this->assertStringNotContainsString('column-count: 1', $rendered);
    }

    public function test_the_desktop_sheet_keeps_its_two_columns(): void
    {
        // The phone rules must narrow the page, not replace the layout.
        $this->dish('Mas Huni', 35);

        $this->get('/menu/print?style=short')
            ->assertOk()
            ->assertSee('.style-short .body { column-count: 2; column-gap: 9mm; }', false);
    }

    /** @return array<string, mixed> */
    private function printViewData(): array
    {
        // Whatever the controller hands the view, so this cannot pass by
        // rendering something the page never renders.
        $response = $this->get('/menu/print');
        $data = $response->original->getData();
        unset($data['forPdf']);

        return $data;
    }

    public function test_no_button_relies_on_an_inline_handler(): void
    {
        /*
         * The Print button did nothing on the live site. The site's CSP is
         * `script-src \'self\' \'nonce-…\'` with no `unsafe-inline`, so the
         * `onclick` it carried was refused by the browser. Every check I ran
         * opened the page from a file:// URL, which has no CSP, so it worked
         * every time and was broken the whole time.
         */
        $this->dish('Mas Huni', 35);

        $html = $this->get('/menu/print')->assertOk()->getContent();

        $this->assertStringNotContainsString('onclick=', $html);
        $this->assertMatchesRegularExpression('/<script nonce="[^"]+"/', $html);
    }

    public function test_the_share_button_is_hidden_until_the_browser_can_share(): void
    {
        // A button that does nothing is worse than no button; the PDF link
        // beside it works everywhere.
        $this->dish('Mas Huni', 35);

        $this->get('/menu/print')
            ->assertOk()
            ->assertSee('data-testid="menu-print-share" hidden', false);
    }

    public function test_the_share_sheet_and_the_download_agree_on_the_filename(): void
    {
        $this->dish('Mas Huni', 35);

        $expected = 'menu-' . now()->format('Y-m-d') . '.pdf';

        $this->get('/menu/print')->assertOk()->assertSee($expected, false);
        $this->assertStringContainsString(
            $expected,
            (string) $this->get('/menu/print.pdf')->assertOk()->headers->get('content-disposition'),
        );
    }

    public function test_the_pdf_carries_no_script_at_all(): void
    {
        $this->dish('Mas Huni', 35);

        $this->assertStringNotContainsString(
            'menuShare',
            $this->get('/menu/print.pdf')->assertOk()->getContent(),
        );
    }

    public function test_cost_price_never_reaches_the_paper(): void
    {
        // The page is public. Anything the kitchen pays must stay off it.
        $this->dish('Mas Huni', 35, ['cost' => 12.34]);

        $this->get('/menu/print')->assertOk()->assertDontSee('12.34');
    }
}
