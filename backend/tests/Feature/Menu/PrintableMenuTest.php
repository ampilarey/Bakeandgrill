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

    public function test_there_is_a_way_back_to_the_menu(): void
    {
        /*
         * Owner, 2026-09-06: "when i go to print in blade menu, there is no go
         * back option. I checked the mobile view." There was not one — three
         * layouts, Dhivehi, Share, PDF and Print, and no way out. On a phone
         * with no browser chrome the page was a dead end.
         */
        $this->dish('Mas Huni', 35);

        $res = $this->get('/menu/print')->assertOk();

        $res->assertSee('data-testid="menu-print-back"', false);
        $res->assertSee('href="' . url('/menu') . '"', false);
    }

    public function test_the_way_back_survives_every_layout_and_dhivehi(): void
    {
        // The toolbar is rebuilt per layout, so the escape has to be in each.
        $this->dish('Mas Huni', 35, ['name_dv' => 'މަސްހުނި']);

        foreach (['short', 'full', 'wall'] as $style) {
            $this->get("/menu/print?style={$style}")
                ->assertOk()
                ->assertSee('data-testid="menu-print-back"', false);
        }

        $this->get('/menu/print?dv=1')
            ->assertOk()
            ->assertSee('data-testid="menu-print-back"', false);
    }

    public function test_the_way_back_is_not_printed_and_not_in_the_pdf(): void
    {
        // It belongs to the screen. A sheet of paper with "← Menu" on it is a
        // mistake, and so is a PDF sent to a customer.
        $this->dish('Mas Huni', 35);

        $this->get('/menu/print')->assertOk()->assertSee('class="toolbar no-print"', false);

        $pdf = $this->get('/menu/print.pdf');
        $pdf->assertOk();
        $this->assertStringNotContainsString('menu-print-back', $pdf->getContent());
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
         * heads that "Other" — and the print sheet read `->name` off it. Every
         * test here had given its items a live category, so nothing caught it.
         */
        $retired = Category::create(['name' => 'Old Section', 'is_active' => false]);
        $this->dish('Orphan Dish', 20, ['category_id' => $retired->id]);

        $this->get('/menu/print')
            ->assertOk()
            ->assertSee('Orphan Dish')
            ->assertSee('Other');
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

        $this->assertStringContainsString('-menu-a4-' . now()->format('Y-m-d') . '.pdf', $disposition);
    }

    public function test_the_pdf_honours_the_layout_it_was_asked_for(): void
    {
        $this->dish('Mas Huni', 35, ['description' => 'Tuna, coconut and onion']);

        // Same paper for both: A5 runs one column either way, so the only
        // difference between the files is the description.
        $short = $this->get('/menu/print.pdf?style=short&paper=a5')->assertOk()->getContent();
        $full = $this->get('/menu/print.pdf?style=full&paper=a5')->assertOk()->getContent();

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
        $this->assertStringContainsString('.body { column-count: 1; }', $html);
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
            ->assertSee('.body { column-count: 2; column-gap: 9mm; }', false);
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

        $expected = 'menu-a4-' . now()->format('Y-m-d') . '.pdf';

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

    public function test_a_phone_gets_a_line_under_every_price(): void
    {
        /*
         * Owner, 2026-09-06: "in mobile menu print page there is no lines so
         * difficult to read the price". I had hidden the leader dots on a
         * phone, which removed the one thing carrying the eye from a dish to
         * its price. Putting them back column-style was worse — the leader
         * cell asks for all the width, so the *name* got squeezed and short
         * names wrapped onto two lines — so the rule goes under the whole row
         * instead.
         */
        $this->dish('Mas Huni', 35);

        $html = $this->get('/menu/print')->assertOk()->getContent();

        $this->assertStringContainsString('row--priced', $html);
        $this->assertStringContainsString('.row--priced {', $html);
        $this->assertStringContainsString('.row td.row__dots { display: none; }', $html);
    }

    public function test_a_name_with_no_price_beside_it_is_not_underlined(): void
    {
        // A sized item's own row carries no price — the sizes below do. A rule
        // under it would be a line to nowhere.
        $this->sized('Bondibai', ['Small' => 20, 'Medium' => 40]);

        $html = $this->get('/menu/print')->assertOk()->getContent();

        $this->assertStringContainsString('<table class="row">', $html);
        $this->assertStringContainsString('class="row row__size row--priced"', $html);
    }

    public function test_a4_keeps_its_leader_dots(): void
    {
        // The phone rule replaces the leader; on paper there is room for the
        // dots to do their job, and they stay.
        $this->dish('Mas Huni', 35);

        $this->get('/menu/print')
            ->assertOk()
            ->assertSee('.row td.row__dots {', false)
            ->assertSee('border-bottom: 1px dotted #cfc6b8;', false);
    }

    /**
     * Owner, 2026-09-21: "paper size options, a5, a4, a3. Portrait,
     * landscape." Both are on the toolbar, both reach @page, and the
     * column count follows them.
     */
    public function test_the_sheet_can_be_laid_out_for_each_paper_and_both_ways_round(): void
    {
        $this->dish('Mas Huni', 35);

        $res = $this->get('/menu/print')->assertOk();
        $res->assertSee('data-testid="menu-print-papers"', false);
        $res->assertSee('>A5<', false)->assertSee('>A4<', false)->assertSee('>A3<', false);
        $res->assertSee('>Portrait<', false)->assertSee('>Landscape<', false);
        $res->assertSee('@page { size: A4 portrait;', false);
        $res->assertSee('.body { column-count: 2;', false);

        $this->get('/menu/print?paper=a5')->assertOk()
            ->assertSee('@page { size: A5 portrait;', false)
            ->assertSee('.body { column-count: 1;', false)
            ->assertSee('max-width: 148mm', false);

        $this->get('/menu/print?paper=a3&orient=landscape')->assertOk()
            ->assertSee('@page { size: A3 landscape;', false)
            ->assertSee('.body { column-count: 4;', false)
            ->assertSee('max-width: 420mm', false);

        // Descriptions want width: the detailed layout takes one column fewer.
        $this->get('/menu/print?paper=a4&orient=landscape&style=full')->assertOk()
            ->assertSee('.body { column-count: 2;', false);

        // A nonsense size or way round falls back rather than erroring.
        $this->get('/menu/print?paper=letter&orient=sideways')->assertOk()
            ->assertSee('@page { size: A4 portrait;', false);
    }

    public function test_switching_the_paper_keeps_the_layout_and_the_language(): void
    {
        $this->dish('Mas Huni', 35);

        $html = $this->get('/menu/print?style=full&dv=1&orient=landscape')->assertOk()->getContent();

        // The A5 link carries everything else that was chosen.
        $this->assertMatchesRegularExpression(
            '#href="[^"]*menu/print\?style=full&(amp;)?paper=a5&(amp;)?orient=landscape&(amp;)?dv=1"#',
            $html,
        );
        // And the PDF is the same sheet.
        $this->assertMatchesRegularExpression(
            '#href="[^"]*menu/print\.pdf\?style=full&(amp;)?paper=a4&(amp;)?orient=landscape&(amp;)?dv=1"#',
            $html,
        );
    }

    /**
     * Owner, 2026-09-21: "logo and branding in each page without taking
     * more space." A browser repeats a table's head and foot on every
     * printed page; the PDF's header is a fixed block and its footer is
     * written by the controller with the page numbers.
     */
    public function test_every_printed_page_carries_the_brand_line_and_the_foot_line(): void
    {
        $this->dish('Mas Huni', 35);

        $html = $this->get('/menu/print')->assertOk()->getContent();
        $this->assertStringContainsString('<thead><tr><td><table class="run run--head run--screen"', $html);
        $this->assertStringContainsString('<tfoot><tr><td>', $html);
        $this->assertStringContainsString('data-testid="menu-print-running-footer"', $html);
        // Shown on paper, not on screen, where the page has its masthead.
        $this->assertStringContainsString('.run--screen { display: none; }', $html);
        $this->assertStringContainsString('.run--screen { display: table; }', $html);

        // The PDF's header is a fixed block in the top margin; the PDF is a
        // real one with pages rather than a screen sheet.
        $data = $this->printViewData();
        $this->assertSame(2, $data['columns']);
        $pdf = $this->get('/menu/print.pdf')->assertOk()->getContent();
        $this->assertStringStartsWith('%PDF-', $pdf);
    }

    /** The PDF's paper follows the request: A3 landscape is a wider page than A4 portrait. */
    public function test_the_pdf_is_the_size_it_was_asked_for(): void
    {
        $this->dish('Mas Huni', 35);

        $a4 = $this->get('/menu/print.pdf?paper=a4')->assertOk()->getContent();
        $a3 = $this->get('/menu/print.pdf?paper=a3&orient=landscape')->assertOk()->getContent();

        // dompdf writes the page box in points: A4 portrait 595×842, A3 landscape 1191×842.
        $this->assertMatchesRegularExpression('#/MediaBox \[0(\.0+)? 0(\.0+)? 595(\.\d+)? 841(\.\d+)?\]#', $a4);
        $this->assertMatchesRegularExpression('#/MediaBox \[0(\.0+)? 0(\.0+)? 1190(\.\d+)? 841(\.\d+)?\]#', $a3);
        $this->assertStringContainsString('menu-a3-', (string) $this->get('/menu/print.pdf?paper=a3')->headers->get('content-disposition'));
    }

    /**
     * Owner, 2026-09-21: "printing menu to make as a book or booklet." A5
     * pages on A4 landscape sheets, covers included, in folding order.
     */
    public function test_the_booklet_is_a4_landscape_sheets_with_covers(): void
    {
        $this->dish('Mas Huni', 35);

        $this->get('/menu/print')->assertOk()
            ->assertSee('data-testid="menu-print-booklet"', false)
            ->assertSee('menu/print/booklet.pdf', false);

        $res = $this->get('/menu/print/booklet.pdf')->assertOk();
        $this->assertSame('application/pdf', $res->headers->get('content-type'));
        $this->assertStringContainsString('-menu-booklet-', (string) $res->headers->get('content-disposition'));
        $pdf = $res->getContent();
        $this->assertStringStartsWith('%PDF-', $pdf);
        // FPDF writes the sheet as A4 landscape in points.
        $this->assertMatchesRegularExpression('#/MediaBox \[0 0 841\.\d+ 595\.\d+\]#', $pdf);
        // Cover, one page of menu, a blank, back cover: one sheet, two sides.
        $this->assertSame(2, preg_match_all('#/Type /Page[^s]#', $pdf));
    }

    /**
     * The PDF's own fonts have no Thaana, so a sheet asked for in Dhivehi
     * came out as boxes. A Thaana face is embedded from disk when asked for,
     * and only then.
     */
    public function test_the_dhivehi_pdf_embeds_a_thaana_font(): void
    {
        $this->dish('Mas Huni', 35, ['name_dv' => 'މަސްހުނި']);

        $plain = $this->get('/menu/print')->assertOk()->original->getData();
        $this->assertNull($plain['dhivehiFontFile']);

        $dv = $this->get('/menu/print?dv=1')->assertOk()->original->getData();
        $this->assertNotNull($dv['dhivehiFontFile']);
        $this->assertFileExists($dv['dhivehiFontFile']);
        $this->assertStringEndsWith('.ttf', $dv['dhivehiFontFile']);

        // The screen sheet never carries the file path; the PDF does.
        $this->get('/menu/print?dv=1')->assertOk()->assertDontSee('@font-face', false);
        $pdf = $this->get('/menu/print.pdf?dv=1')->assertOk()->getContent();
        $this->assertStringContainsString('/FontFile2', $pdf);
    }

    /** A dish the owner ticked Featured carries a star on paper, as it leads the menu online. */
    public function test_a_featured_dish_is_starred(): void
    {
        $this->dish('Mas Huni', 35, ['is_featured' => true]);
        $this->dish('Bis Keemia', 5);

        $html = $this->get('/menu/print')->assertOk()->getContent();

        $this->assertStringContainsString('<span class="row__star">★</span> Mas Huni', $html);
        $this->assertStringNotContainsString('★</span> Bis Keemia', $html);
    }

    public function test_cost_price_never_reaches_the_paper(): void
    {
        // The page is public. Anything the kitchen pays must stay off it.
        $this->dish('Mas Huni', 35, ['cost' => 12.34]);

        $this->get('/menu/print')->assertOk()->assertDontSee('12.34');
    }
}
