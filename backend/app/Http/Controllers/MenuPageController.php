<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Catalog\Services\NewMenuItemService;
use App\Domains\Inventory\Services\RecipeStockService;
use App\Domains\Menu\Services\BundleSummaryService;
use App\Domains\Promotions\Services\OffersService;
use App\Models\Category;
use App\Models\Item;
use App\Services\AvailabilityResult;
use App\Services\EffectivePriceService;
use App\Services\ItemAvailabilityService;
use App\Services\SpecialPricingService;
use App\Support\ItemDisplayPhoto;
use App\Support\QrSvg;
use App\Support\SocialPreviewImage;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The menu, rendered on the server.
 *
 * Replaces two things that both failed the same way. `/menu` was a 301 into
 * `/order/menu`, and the dine-in QR used to land on a React view-only route
 * — both SPAs, so a crawler asking for either received `<div id="root"></div>`
 * and the site's own `Restaurant` schema pointed at that empty page.
 *
 * SEO is the smaller half of the reason. The bigger one is the person at a
 * table: scanning a QR code used to mean downloading a large JavaScript bundle
 * before a single item appeared, indoors, often on weak mobile data. Plain
 * HTML shows immediately.
 *
 * Reading lives here; the cart and checkout stay in the SPA. Cards open
 * /menu/{id} (another server-rendered document — full description, variants,
 * tags). Add to order hands off to /order/menu?item={id}.
 *
 * **No service-availability notice here, by the owner's decision (2026-08-22).**
 * A version of this page resolved ServiceAvailabilityService and rendered the
 * shared banner partial, so /menu said "Online ordering is currently closed"
 * whenever the ordering gate was shut. It was accurate and it was removed
 * anyway: this is a menu, the ordering state belongs where someone tries to
 * order, and the notice sat on the page all day because the ordering window
 * is narrower than the opening hours. `ShareServiceAvailability` shares
 * `serviceBanner` as null for every Blade page, so nothing renders. The
 * full-page `marketing_site` maintenance view is unaffected — that is the
 * middleware's own 503 and still applies. Do not re-add this without asking.
 */
class MenuPageController extends Controller
{
    /** Print layouts, in the order the toolbar offers them. */
    private const PRINT_STYLES = ['short', 'full', 'wall'];

    public function index(): View
    {
        return $this->renderMenu(null);
    }

    /**
     * One category on its own, for sharing.
     *
     * Owner, 2026-09-21: "Is there any way that I can share a category in
     * the menu? When opened only that category shows but option to see full
     * menu." The same page as /menu — same cards, same sheet, same sold-out
     * marks — with the other categories, the rail and the offers left out,
     * a line saying what is being shown, and a way back to everything. A
     * sub-category shows under its parent's band with its siblings left out.
     */
    public function category(string $category): View
    {
        $row = Category::query()->where('is_active', true)->where('slug', $category)->first();
        if ($row === null && ctype_digit($category)) {
            $row = Category::query()->where('is_active', true)->find((int) $category);
        }
        if ($row !== null) {
            return $this->renderMenu($row);
        }
        // The two sections that are not categories share the same page shape
        // (owner, 2026-09-21: "same type banner as a category and option to
        // share and open same way"). A real category with either slug wins.
        if (array_key_exists($category, self::SECTION_NAMES)) {
            return $this->renderMenu(null, $category);
        }

        abort(404);
    }

    /** The menu's two sections that are not categories, by the slug of their page. */
    public const SECTION_NAMES = [
        'other' => 'Other',
        'events' => 'Event & catering menu',
    ];

    /**
     * The pages either side of this one, for "← Shorteats · Fast food →" at
     * the foot of a category's page. Top-level pages run in menu order —
     * every parent, Other, Events; a sub-category's page steps through its
     * siblings. Each side is a Category, 'other', 'events' or null.
     *
     * @param Collection<int, array{category: ?Category, items: Collection<int, Item>, subcategories: list<array{category: Category, items: Collection<int, Item>}>}> $railGroups
     * @return array{prev: Category|string|null, next: Category|string|null}
     */
    private function neighbours(Collection $railGroups, bool $hasEvents, ?Category $only, ?string $section): array
    {
        if ($only !== null && $only->parent_id !== null) {
            $parentGroup = $railGroups->first(fn (array $g) => $g['category'] !== null && (int) $g['category']->id === (int) $only->parent_id);
            $ring = collect($parentGroup['subcategories'] ?? [])->map(fn (array $sub) => $sub['category']);
            $index = $ring->search(fn (Category $c) => (int) $c->id === (int) $only->id);
        } else {
            $ring = $railGroups->map(fn (array $g) => $g['category'] ?? 'other');
            if ($hasEvents) {
                $ring->push('events');
            }
            $index = $ring->search(fn ($entry) => $section !== null
                ? $entry === $section
                : ($entry instanceof Category && (int) $entry->id === (int) $only->id));
        }
        if ($index === false) {
            return ['prev' => null, 'next' => null];
        }
        $ring = $ring->values();

        return [
            'prev' => $index > 0 ? $ring[$index - 1] : null,
            'next' => $index < $ring->count() - 1 ? $ring[$index + 1] : null,
        ];
    }

    /** The link a category is shared by: its slug when it has one, else its id. */
    public static function categoryUrl(Category $category): string
    {
        $slug = trim((string) ($category->slug ?? ''));

        return url('/menu/c/' . ($slug !== '' ? $slug : $category->id));
    }

    private function renderMenu(?Category $only, ?string $section = null): View
    {
        $items = $this->menuItems();
        $categories = $this->activeCategories();
        $offers = collect(app(OffersService::class)->activeOffers());

        // The rail lists the whole menu on every page. On a category's own
        // page each entry opens that category's page instead of scrolling
        // (owner, 2026-09-21: "adding rails same as menu? When clicked only
        // that category shows").
        [$railCatering, $railRegular] = $items->partition(fn (Item $item) => $this->isCateringItem($item, $categories));
        $railGroups = $this->groupByParent($railRegular->values(), $categories);
        $railCateringCount = $railCatering->count();

        // Hand-picked dishes ahead of the categories, on the full menu only
        // (owner, 2026-09-21: "any specific category to show at the top?").
        // A category's own page is that category alone, as with offers.
        $featured = ($section === null && $only === null)
            ? $items->filter(fn (Item $item) => (bool) $item->is_featured)->values()
            : collect();

        if ($section !== null) {
            [$catering, $regular] = $items->partition(fn (Item $item) => $this->isCateringItem($item, $categories));
            if ($section === 'events') {
                $groups = collect();
                $items = $catering->values();
            } else {
                // The leftover bucket alone: groupByParent's group with no category.
                $groups = $this->groupByParent($regular->values(), $categories)
                    ->filter(fn (array $group) => $group['category'] === null)->values();
                $items = $groups->flatMap(fn (array $group) => $group['items'])->values();
                $catering = collect();
            }
            $offers = collect();
        } elseif ($only !== null) {
            // The category and its children, or a sub-category and its parent
            // (for the band). Nothing else, so an "also show in" placement
            // elsewhere does not drag another section in.
            $family = $categories->filter(fn (Category $c) => (int) $c->id === (int) $only->id
                || (int) $c->parent_id === (int) $only->id);
            $ids = $family->keys()->map(fn ($id) => (int) $id)->all();
            $items = $items->filter(fn (Item $item) => in_array((int) $item->category_id, $ids, true)
                || array_intersect($ids, $item->extraCategoryIds()) !== [])->values();
            $categories = $categories->filter(fn (Category $c) => in_array((int) $c->id, $ids, true)
                || ($only->parent_id !== null && (int) $c->id === (int) $only->parent_id));
            $offers = collect();

            $parentOfOnly = $only->parent_id ? $categories->get((int) $only->parent_id) : null;
            $isEvents = self::categoryLooksLikeCatering($only->name)
                || ($parentOfOnly !== null && self::categoryLooksLikeCatering($parentOfOnly->name));
            $catering = $isEvents ? $items : collect();
            $groups = $isEvents ? collect() : $this->groupByParent($items, $categories);
        } else {
            // Event and catering dishes get their own section at the end, as in
            // the order app, and leave their category (a bare "Events" parent
            // would otherwise be a second copy of the same list).
            [$catering, $regular] = $items->partition(fn (Item $item) => $this->isCateringItem($item, $categories));
            $groups = $this->groupByParent($regular->values(), $categories);
        }

        $pricing = app(SpecialPricingService::class);
        $specialsByItemId = $this->indexSpecialsByItem($pricing->activeSpecialsForDisplay());

        return view('menu', [
            'menuCategories' => $groups,
            'menuItemCount' => $items->count(),
            'menuCatering' => $catering->values(),
            'menuOnlyCategory' => $only ?? $section,
            'menuOnlyCategoryName' => $only?->name ?? ($section !== null ? self::SECTION_NAMES[$section] : null),
            'menuRailGroups' => $railGroups,
            'menuRailCateringCount' => $railCateringCount,
            'menuNeighbours' => ($only !== null || $section !== null)
                ? $this->neighbours($railGroups, $railCateringCount > 0, $only, $section)
                : null,
            'menuRailActive' => [
                'category' => $only?->id,
                'parent' => $only?->parent_id,
                'section' => $section,
            ],
            'menuCategoryUrls' => $this->activeCategories()->map(fn (Category $c) => self::categoryUrl($c))->all()
                + ['other' => url('/menu/c/other'), 'events' => url('/menu/c/events')],
            'menuSectionBanners' => [
                'other' => (string) content('menu_other_banner_image'),
                'events' => (string) content('menu_events_banner_image'),
            ],
            'menuSoldOut' => $this->soldOutLabels($items),
            'menuOffers' => $offers,
            'menuFeatured' => $featured,
            'menuFeaturedTitle' => trim((string) content('menu_featured_title')) ?: "Chef's picks",
            'menuSpecialsByItemId' => $specialsByItemId,
            'menuPriceByItemId' => $this->effectivePrices($items),
            'menuNewItemIds' => app(NewMenuItemService::class)->newItemIds(),
            'menuBundles' => app(BundleSummaryService::class)->forItems($items),
            'menuPhotos' => $this->displayPhotos($items),
            'menuDietaryFilters' => $this->dietaryFilters($items),
            'favouriteIds' => $this->favouriteItemIds(),
            // Passed in rather than read from the layout: a child view's
            // sections are evaluated before the layout renders, so anything
            // the layout defines in its own @php block is not in scope here.
            'menuLocale' => $this->menuLocale(),
        ]);
    }

    /**
     * The menu on paper.
     *
     * Owner, 2026-09-05: "make a print option. Make different options. Short
     * version, details ect."
     *
     * Three layouts off one page, chosen by `?style=`: a dense two-column
     * price list, a full menu with descriptions and every size, and a
     * large-type sheet meant to be read from across a counter. The toolbar
     * that switches between them is `.no-print`, so what comes out of the
     * printer is the menu and nothing else.
     *
     * Deliberately different from `/menu` in one respect: this lists every
     * *active* item, including ones marked sold out today. A printed sheet
     * outlives today — dropping tonight's 86'd dish would quietly reprint the
     * menu without it, and re-listing it tomorrow means printing again.
     */
    public function print(Request $request): View
    {
        $options = $this->printOptions($request);
        $items = $this->printableItems();
        $categories = $this->activeCategories();

        return view('menu-print', $this->printData($items, $categories, $options));
    }

    /**
     * The same sheet as a PDF, for sending to somebody.
     *
     * Owner, 2026-09-05: "Add pdf share option." dompdf renders the same view,
     * which is why the rows are tables rather than flexbox — one template that
     * both a browser and dompdf lay out the same way, instead of a second copy
     * to keep in step.
     */
    public function printPdf(Request $request): Response
    {
        $options = $this->printOptions($request);
        $data = $this->printData($this->printableItems(), $this->activeCategories(), $options);
        $data['forPdf'] = true;

        return $this->renderPdf($data)->download($data['pdfFilename']);
    }

    /**
     * The menu as a booklet: A5 pages imposed two-up on A4 landscape sheets
     * in the order that folds and staples in the middle.
     *
     * Owner, 2026-09-21: "sometimes we will be downloading and printing menu
     * to make as a book or booklet." A cover, the menu, a back cover with the
     * QR, padded to a multiple of four so the fold works; print it two-sided,
     * flipped on the short edge, fold the stack in half.
     */
    public function printBooklet(Request $request): Response
    {
        $options = $this->printOptions($request);
        $options['paper'] = 'a5';
        $options['orient'] = 'portrait';
        $data = $this->printData($this->printableItems(), $this->activeCategories(), $options);
        $data['forPdf'] = true;
        $data['booklet'] = true;

        $pages = $this->renderPdf($data)->output();
        $imposed = app(\App\Domains\Menu\Services\BookletImposer::class)->impose($pages);

        return response($imposed, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . $data['bookletFilename'] . '"',
        ]);
    }

    /**
     * Paper sizes the sheet can be laid out for, and the two ways round.
     * Owner, 2026-09-21: "paper size options, a5, a4, a3. Portrait, landscape."
     */
    public const PRINT_PAPERS = ['a5', 'a4', 'a3'];

    public const PRINT_ORIENTATIONS = ['portrait', 'landscape'];

    /**
     * The sheet's options off the query string, each falling back rather than
     * failing: a pasted or edited URL should print something, not a 500.
     *
     * @return array{style: string, paper: string, orient: string, dv: bool}
     */
    private function printOptions(Request $request): array
    {
        $style = (string) $request->query('style', 'short');
        $paper = strtolower((string) $request->query('paper', 'a4'));
        $orient = strtolower((string) $request->query('orient', 'portrait'));

        return [
            'style' => in_array($style, self::PRINT_STYLES, true) ? $style : 'short',
            'paper' => in_array($paper, self::PRINT_PAPERS, true) ? $paper : 'a4',
            'orient' => in_array($orient, self::PRINT_ORIENTATIONS, true) ? $orient : 'portrait',
            'dv' => $request->boolean('dv'),
        ];
    }

    /**
     * How many columns the list runs in, from the paper and the layout. A
     * short price list on A4 reads in two; the same list on A5 needs one,
     * and on A3 sideways it can take four. Descriptions want width, so the
     * detailed layout takes one fewer; wall type takes one, two sideways.
     */
    public static function printColumns(string $style, string $paper, string $orient): int
    {
        $landscape = $orient === 'landscape';

        return match ($style) {
            'full' => match ($paper) {
                'a5' => 1,
                'a3' => $landscape ? 3 : 2,
                default => $landscape ? 2 : 1,
            },
            'wall' => $landscape ? 2 : 1,
            default => match ($paper) {
                'a5' => $landscape ? 2 : 1,
                'a3' => $landscape ? 4 : 3,
                default => $landscape ? 3 : 2,
            },
        };
    }

    /**
     * dompdf's page, with the running footer written onto every page after
     * layout: "Bake & Grill · bakeandgrill.mv/menu · page 2 of 5". Page
     * numbers cannot be known from inside the HTML, which is why the footer
     * is drawn here and not in the view.
     */
    private function renderPdf(array $data): \Barryvdh\DomPDF\PDF
    {
        \Illuminate\Support\Facades\File::ensureDirectoryExists(storage_path('fonts'));

        $pdf = Pdf::loadView('menu-print', $data)
            ->setPaper($data['paper'], $data['orient']);
        $pdf->render();

        $canvas = $pdf->getDomPDF()->getCanvas();
        $metrics = $pdf->getDomPDF()->getFontMetrics();
        $font = $metrics->getFont('DejaVu Sans', 'normal');
        $size = $data['paper'] === 'a5' ? 6.5 : 7.5;
        $mm = 72 / 25.4;
        $colour = [0.42, 0.36, 0.31];
        $left = $data['brand'] . '  ·  ' . $data['menuUrl'] . '  ·  Prices in MVR, may change';
        $booklet = (bool) ($data['booklet'] ?? false);

        $canvas->page_script(function (int $pageNumber, int $pageCount, $canvas) use ($left, $font, $size, $mm, $colour, $metrics, $booklet): void {
            // A booklet's covers carry their own foot; the running one stays off them.
            if ($booklet && ($pageNumber === 1 || $pageNumber === $pageCount)) {
                return;
            }
            $y = $canvas->get_height() - 11 * $mm;
            $right = $booklet
                ? sprintf('%d', $pageNumber - 1)
                : sprintf('Page %d of %d', $pageNumber, $pageCount);
            $rightWidth = $metrics->getTextWidth($right, $font, $size);
            $canvas->text(12 * $mm, $y, $left, $font, $size, $colour);
            $canvas->text($canvas->get_width() - 12 * $mm - $rightWidth, $y, $right, $font, $size, $colour);
        });

        return $pdf;
    }

    /**
     * Opening hours as a few short lines for the booklet's back cover:
     * consecutive days with the same hours fold into one, "Sat–Thu 07:00–23:00".
     *
     * @return list<string>
     */
    private function hoursLines(): array
    {
        try {
            $hours = app(\App\Services\OpeningHoursService::class)->getHoursForDisplay();
        } catch (\Throwable) {
            return [];
        }
        $names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        $runs = [];
        for ($day = 0; $day < 7; $day++) {
            $row = $hours[$day] ?? null;
            $text = (!is_array($row) || ($row['closed'] ?? false) || empty($row['open']) || empty($row['close']))
                ? 'Closed'
                : $row['open'] . '–' . $row['close'];
            $last = $runs !== [] ? array_key_last($runs) : null;
            if ($last !== null && $runs[$last]['text'] === $text) {
                $runs[$last]['to'] = $day;
            } else {
                $runs[] = ['from' => $day, 'to' => $day, 'text' => $text];
            }
        }
        if (count($runs) === 1 && $runs[0]['text'] === 'Closed') {
            return [];
        }

        return array_map(
            fn (array $run) => ($run['from'] === $run['to'] ? $names[$run['from']] : $names[$run['from']] . '–' . $names[$run['to']]) . ' ' . $run['text'],
            $runs,
        );
    }

    /**
     * Everything both the screen sheet and the PDF need, built once.
     *
     * @param Collection<int, Item> $items
     * @param Collection<int, Category> $categories
     * @param array{style: string, paper: string, orient: string, dv: bool} $options
     * @return array<string, mixed>
     */
    private function printData(Collection $items, Collection $categories, array $options): array
    {
        $brand = trim((string) (content('site_name', '') ?: config('app.name', 'Bake & Grill')));
        $style = $options['style'];
        $showDhivehi = $options['dv'];
        $groups = $this->groupByParent($items, $categories);
        $columns = self::printColumns($style, $options['paper'], $options['orient']);

        return [
            'printStyle' => $style,
            'printStyles' => self::PRINT_STYLES,
            'printPapers' => self::PRINT_PAPERS,
            'paper' => $options['paper'],
            'orient' => $options['orient'],
            // For @page and the on-screen sheet: "A4 landscape" and its mm.
            'pageSize' => strtoupper($options['paper']) . ' ' . $options['orient'],
            'pageWidthMm' => $this->paperWidthMm($options['paper'], $options['orient']),
            'columns' => $columns,
            // dompdf has no CSS columns, so the PDF's columns are a table with
            // the categories dealt across it in menu order, balanced by rows.
            'columnRows' => $this->columnRows($this->dealAcrossColumns($groups, $columns)),
            'showDhivehi' => $showDhivehi,
            'dhivehiFontFile' => $showDhivehi ? $this->dhivehiFontFile() : null,
            'forPdf' => false,
            'booklet' => false,
            'brand' => $brand,
            'brandLogo' => $this->brandLogoDataUri(),
            'brandTagline' => trim((string) content('site_tagline', '')),
            'brandAddress' => trim((string) content('business_address', '')),
            'brandPhone' => trim((string) content('business_phone', '')),
            // Scan the sheet, open the live menu. The printed prices are a
            // snapshot; this is the copy that is never out of date.
            'menuQr' => QrSvg::branded(route('menu'), 180),
            'menuUrl' => preg_replace('#^https?://#', '', route('menu')),
            // Named here so the page's share sheet and the download agree on
            // what the file is called.
            'pdfFilename' => sprintf(
                '%s-menu-%s-%s.pdf',
                Str::slug($brand) ?: 'menu',
                $options['paper'],
                now()->format('Y-m-d'),
            ),
            'bookletFilename' => sprintf(
                '%s-menu-booklet-%s.pdf',
                Str::slug($brand) ?: 'menu',
                now()->format('Y-m-d'),
            ),
            'brandHours' => $this->hoursLines(),
            // A second code on the last page: the complaint box, tagged as
            // coming from print (owner, 2026-09-21).
            'complaintLine' => trim((string) content('complaint_prompt_text', '')),
            'complaintUrl' => \App\Support\ComplaintBoxLink::url('print'),
            'complaintQr' => \App\Support\ComplaintBoxLink::qr(\App\Support\ComplaintBoxLink::url('print'), 180),
            'menuCategories' => $groups,
            'menuItemCount' => $items->count(),
            'menuPriceByItemId' => $this->effectivePrices($items),
            'menuVariantPricesByItemId' => $this->variantPrices($items),
            'menuLocale' => $this->menuLocale(),
            'printedAt' => now(),
        ];
    }

    /** The sheet's width on screen, so the preview is the shape of the paper. */
    private function paperWidthMm(string $paper, string $orient): int
    {
        [$short, $long] = match ($paper) {
            'a5' => [148, 210],
            'a3' => [297, 420],
            default => [210, 297],
        };

        return $orient === 'landscape' ? $long : $short;
    }

    /**
     * Deal the categories across N columns in menu order, each column taking
     * roughly the same number of rows. A category is never split, so a
     * heading always sits over its own dishes.
     *
     * @param Collection<int, array{category: ?Category, items: Collection<int, Item>, subcategories: list<array{category: Category, items: Collection<int, Item>}>}> $groups
     * @return list<list<array{category: ?Category, items: Collection<int, Item>, subcategories: list<array{category: Category, items: Collection<int, Item>}>}>>
     */
    private function dealAcrossColumns(Collection $groups, int $columns): array
    {
        $weight = static function (array $group): int {
            $rows = 2 + $group['items']->count();
            foreach ($group['subcategories'] as $sub) {
                $rows += 1 + $sub['items']->count();
            }

            return $rows;
        };

        $total = $groups->sum($weight);
        $target = $columns > 0 ? $total / $columns : $total;
        $dealt = array_fill(0, max(1, $columns), []);
        $col = 0;
        $filled = 0;
        foreach ($groups as $group) {
            $rows = $weight($group);
            // Move on once this column is fuller than its share, unless it is
            // the last one, which takes the rest.
            if ($filled > 0 && $filled + $rows / 2 > $target && $col < $columns - 1) {
                $col++;
                $filled = 0;
            }
            $dealt[$col][] = $group;
            $filled += $rows;
        }

        return $dealt;
    }

    /**
     * The dealt columns as table rows for dompdf: row i holds the i-th line
     * of every column, one dish or heading per cell.
     *
     * dompdf has no CSS columns, and a table with one tall cell per column
     * cannot break across pages — it jumped whole to the next page and lost
     * its right-hand cell. Short rows break wherever they like, so the
     * columns flow down the pages together.
     *
     * @param list<list<array{category: ?Category, items: Collection<int, Item>, subcategories: list<array{category: Category, items: Collection<int, Item>}>}>> $columnGroups
     * @return list<list<array{kind: string, text?: string, item?: Item}|null>>
     */
    private function columnRows(array $columnGroups): array
    {
        $lines = [];
        foreach ($columnGroups as $groups) {
            $column = [];
            foreach ($groups as $group) {
                if ($group['items']->isEmpty() && $group['subcategories'] === []) {
                    continue;
                }
                $column[] = ['kind' => 'cat', 'text' => $group['category']?->name ?: 'Other'];
                foreach ($group['items'] as $item) {
                    $column[] = ['kind' => 'dish', 'item' => $item];
                }
                foreach ($group['subcategories'] as $sub) {
                    $column[] = ['kind' => 'sub', 'text' => $sub['category']->name];
                    foreach ($sub['items'] as $item) {
                        $column[] = ['kind' => 'dish', 'item' => $item];
                    }
                }
            }
            $lines[] = $column;
        }

        $height = max(array_map('count', $lines) ?: [0]);
        $rows = [];
        for ($i = 0; $i < $height; $i++) {
            $rows[] = array_map(fn (array $column) => $column[$i] ?? null, $lines);
        }

        return $rows;
    }

    /**
     * A Thaana font file dompdf can embed, or null.
     *
     * The PDF's own fonts have no Thaana, so a sheet asked for in Dhivehi
     * came out as boxes. The owner's uploaded font is used when it is a TTF
     * or OTF on disk; a WOFF2 (what the upload converts to when it can) is
     * not something dompdf reads, and the shipped A_Faruma covers it then.
     */
    private function dhivehiFontFile(): ?string
    {
        $custom = trim((string) content(\App\Domains\Content\DhivehiFont::CONTENT_KEY, ''));
        if ($custom !== '' && \App\Domains\Content\DhivehiFont::isSafePublicUrl($custom)
            && preg_match('/\.(ttf|otf)$/', $custom)) {
            $file = public_path(ltrim($custom, '/'));
            if (is_file($file) && is_readable($file)) {
                return $file;
            }
        }

        $shipped = public_path('fonts/a_faruma.ttf');

        return is_file($shipped) ? $shipped : null;
    }

    /**
     * @return Collection<int, Item>
     */
    private function printableItems(): Collection
    {
        return Item::query()
            ->with(['variants', 'category', 'extraCategories'])
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();
    }

    /**
     * The logo as a `data:` URI, or null when there is not one to be had.
     *
     * Read off disk rather than fetched: dompdf would otherwise have to make an
     * HTTP request to our own site to build a PDF, which fails quietly behind a
     * firewall and turns a menu into a broken image box. A remote logo URL is
     * simply not embedded — the sheet keeps its wordmark and prints fine.
     */
    private function brandLogoDataUri(): ?string
    {
        $raw = trim((string) content('logo', '')) ?: '/logo.png';
        $path = parse_url($raw, PHP_URL_PATH) ?: $raw;
        $file = public_path(ltrim((string) $path, '/'));

        if (!is_file($file) || !is_readable($file)) {
            return null;
        }

        // A masthead logo is small; anything this large is a mistake upstream
        // and would bloat every PDF we hand out.
        if (filesize($file) > 2 * 1024 * 1024) {
            return null;
        }

        $mime = match (strtolower(pathinfo($file, PATHINFO_EXTENSION))) {
            'png' => 'image/png',
            'jpg', 'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'svg' => 'image/svg+xml',
            default => null,
        };

        if ($mime === null) {
            return null;
        }

        return 'data:' . $mime . ';base64,' . base64_encode((string) file_get_contents($file));
    }

    /**
     * Every size, named, with its own effective price.
     *
     * `effectivePriceFor` answers "from" — the cheapest size — which is right
     * for a card on a phone and useless on a price list, where somebody has to
     * read off what a Large costs. The money itself comes from
     * `effectiveVariantPrices`, the same helper the single-item page uses, so
     * a discounted size cannot print at one price here and another there.
     *
     * @param Collection<int, Item> $items
     * @return array<int, list<array{name: string, price: float, was: ?float}>>
     */
    private function variantPrices(Collection $items): array
    {
        $out = [];

        foreach ($items as $item) {
            if (!$item->has_variants || !$item->relationLoaded('variants')) {
                continue;
            }

            $priced = $this->effectiveVariantPrices($item);

            $rows = [];
            foreach ($item->variants->where('is_active', true)->sortBy('sort_order') as $variant) {
                if (!isset($priced[$variant->id])) {
                    continue;
                }
                $rows[] = ['name' => (string) $variant->name] + $priced[$variant->id];
            }

            if ($rows !== []) {
                $out[$item->id] = $rows;
            }
        }

        return $out;
    }

    /**
     * One item, as its own document. A crawler (and a phone on weak data)
     * gets the description and every size without waiting for a JS sheet.
     *
     * Known items that are inactive, unavailable, or soft-deleted still
     * resolve: old social posts must not 404. A true 404 is only for an
     * id that never existed.
     */
    public function show(int $item, Request $request): View
    {
        $row = Item::query()
            ->with([
                'variants', 'category', 'photos',
                'recipe.recipeItems.inventoryItem',
                'comboItems.item:id,name,name_dv,is_active,base_price,has_variants',
                'comboItems.item.variants',
                'platterGroups.allowedItems.item:id,name,is_active',
            ])
            ->withTrashed()
            ->find($item);

        if ($row === null) {
            abort(404);
        }

        // Retired and deleted dishes are simply off. A live one is asked the
        // same question the order app asks — stock, ingredients, the Sold out
        // toggle — so the page never offers what the kitchen cannot make.
        $verdict = (!$row->trashed() && $row->is_active)
            ? app(ItemAvailabilityService::class)->checkAnyChannel($row)
            : null;
        $available = $verdict?->allowed ?? false;
        $alternatives = $available ? collect() : $this->categoryAlternatives($row);
        $note = trim((string) ($row->unavailable_reason_note ?? ''));

        $priced = collect([$row])->concat($alternatives);
        $specialsByItemId = $this->indexSpecialsByItem(
            app(SpecialPricingService::class)->activeSpecialsForDisplay(),
        );

        // The menu grid opens an item in a sheet, so it asks for the body on
        // its own. Gated on the header rather than a query string: a fragment
        // has no <head>, no canonical and no structured data, so it must not
        // be something a crawler or a shared link can land on. Anything that
        // arrives without the header — a person, a bot, a pasted URL — gets
        // the whole page exactly as before.
        $isSheet = $request->header('X-Menu-Sheet') === '1';

        return view('menu-item', [
            'menuItemLayout' => $isSheet ? 'layouts.fragment' : 'layout',
            'item' => $row,
            'itemAvailable' => $available,
            'itemUnavailableLabel' => $verdict ? $this->unavailableLabel($verdict) : 'Currently unavailable',
            'itemUnavailableNote' => $note !== '' ? $note : ($verdict && $verdict->reasonCode === 'out_of_stock'
                ? 'We have run out for now. You can still share the page, or browse something else.'
                : 'This item is not on the menu right now. You can still share the page, or browse something else.'),
            'menuSizeSoldOut' => $this->soldOutSizes($row),
            'alternatives' => $alternatives,
            'menuPhotos' => $this->displayPhotos($priced),
            'menuSpecialsByItemId' => $specialsByItemId,
            'menuPriceByItemId' => $this->effectivePrices($priced),
            'menuVariantPrices' => $this->effectiveVariantPrices($row),
            'menuBundle' => app(BundleSummaryService::class)->forItem($row),
            'socialImage' => app(SocialPreviewImage::class)->forItem($row),
            'favouriteIds' => $this->favouriteItemIds(),
            'menuLocale' => $this->menuLocale(),
        ]);
    }

    /**
     * Every active dish, sold out or not.
     *
     * Owner, 2026-09-21: "if the item is out of stock, I want the customers
     * to see and click even though it's dimmed. Because details will be seen
     * when clicked." Until then a dish with the Sold out toggle off was
     * dropped from the page, which reads as "they don't make this" rather
     * than "come back tomorrow". Retired dishes stay off: that one really is
     * not on the menu.
     *
     * @return Collection<int, Item>
     */
    private function menuItems(): Collection
    {
        return Item::query()
            // The bundle relations are what tells a reader that "Mixed Platter"
            // is choose-your-own (owner's audit, 2026-09-06, F7). Eager-loaded
            // rather than resolved per card, which would be an N+1 across the
            // whole menu. The recipe is loaded for the same reason: the
            // sold-out check reads the ingredient pool of every dish that
            // limits itself by it.
            ->with([
                'variants', 'category', 'photos', 'extraCategories', 'channelAvailabilities',
                'recipe.recipeItems.inventoryItem',
                'comboItems.item:id,name,name_dv,is_active,base_price,has_variants',
                'comboItems.item.variants',
                'platterGroups.allowedItems.item:id,name,is_active',
            ])
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();
    }

    /**
     * Does this dish belong in the Event & catering section? The order app's
     * rule (`isMenuCateringItem`): switched on for the catering channel, or
     * filed under a category — or a sub-category of one — named Catering or
     * Events.
     *
     * @param Collection<int, Category> $categories
     */
    private function isCateringItem(Item $item, Collection $categories): bool
    {
        if ((bool) ($item->channelAvailabilityFor('catering')?->is_enabled ?? false)) {
            return true;
        }

        $category = $item->category_id ? $categories->get((int) $item->category_id) : null;
        if ($category === null) {
            return false;
        }
        if (self::categoryLooksLikeCatering($category->name)) {
            return true;
        }
        $parent = $category->parent_id ? $categories->get((int) $category->parent_id) : null;

        return $parent !== null && self::categoryLooksLikeCatering($parent->name);
    }

    public static function categoryLooksLikeCatering(?string $name): bool
    {
        return $name !== null && preg_match('/\b(catering|events?)\b/i', trim($name)) === 1;
    }

    /**
     * The dishes a customer cannot have today, keyed by id, with the word the
     * card wears. The order app's own vocabulary: "Sold out" when the kitchen
     * has run out or switched it off, "Unavailable today" for a snooze.
     *
     * @param Collection<int, Item> $items
     * @return array<int, string>
     */
    private function soldOutLabels(Collection $items): array
    {
        $availability = app(ItemAvailabilityService::class);

        $out = [];
        foreach ($items as $item) {
            $verdict = $availability->checkAnyChannel($item);
            if (!$verdict->allowed) {
                $out[$item->id] = $this->unavailableLabel($verdict);
            }
        }

        return $out;
    }

    private function unavailableLabel(AvailabilityResult $verdict): string
    {
        return match ($verdict->reasonCode) {
            'out_of_stock', 'item_unavailable' => 'Sold out',
            'snoozed' => 'Unavailable today',
            default => 'Currently unavailable',
        };
    }

    /**
     * Sizes of one dish that cannot be picked today, keyed by variant id —
     * the same verdict the order app's size chips get.
     *
     * @return array<int, true>
     */
    private function soldOutSizes(Item $item): array
    {
        if (!$item->has_variants || $item->trashed()) {
            return [];
        }

        $availability = app(ItemAvailabilityService::class);
        $portions = app(RecipeStockService::class)->portionsByVariant($item);

        $out = [];
        foreach ($item->variants as $variant) {
            $fields = $availability->sizeFields($variant, $portions);
            if (($fields['is_available'] ?? true) === false) {
                $out[(int) $variant->id] = true;
            }
        }

        return $out;
    }

    /**
     * @return Collection<int, Category>
     */
    private function activeCategories(): Collection
    {
        return Category::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get()
            ->keyBy('id');
    }

    /**
     * Parent category sections, with subcategory blocks inside them.
     *
     * Mirrors MenuViewPage: the rail lists parents only. A subcategory that
     * used to render as its own top-level section now sits under its parent.
     *
     * @param Collection<int, Item> $items
     * @param Collection<int, Category> $categories
     * @return Collection<int, array{category: ?Category, items: Collection<int, Item>, subcategories: list<array{category: Category, items: Collection<int, Item>}>}>
     */
    private function groupByParent(Collection $items, Collection $categories): Collection
    {
        if ($items->isEmpty()) {
            return collect();
        }

        $used = [];
        $ordered = collect();

        $parents = $categories->filter(fn (Category $category) => $category->parent_id === null);

        // An item is listed under its home category and under every "also
        // show in" category (owner, 2026-09-03: Bajiya under Kulhi Hedhikaa
        // and under Evening Tea). Same card in each place; the home still
        // owns its sort order and everything else.
        $inCategory = fn (Item $item, int $categoryId): bool => (int) $item->category_id === $categoryId
            || in_array($categoryId, $item->extraCategoryIds(), true);

        foreach ($parents as $parent) {
            $direct = $items->filter(fn (Item $item) => $inCategory($item, (int) $parent->id))->values();
            $subs = $categories
                ->filter(fn (Category $category) => (int) $category->parent_id === (int) $parent->id)
                ->map(function (Category $sub) use ($items, $inCategory) {
                    $subItems = $items->filter(fn (Item $item) => $inCategory($item, (int) $sub->id))->values();

                    return $subItems->isEmpty() ? null : [
                        'category' => $sub,
                        'items' => $subItems,
                    ];
                })
                ->filter()
                ->values()
                ->all();

            foreach ($direct as $item) {
                $used[$item->id] = true;
            }
            foreach ($subs as $block) {
                foreach ($block['items'] as $item) {
                    $used[$item->id] = true;
                }
            }

            if ($direct->isEmpty() && $subs === []) {
                continue;
            }

            $ordered->push([
                'category' => $parent,
                'items' => $direct,
                'subcategories' => $subs,
            ]);
        }

        $leftover = $items->reject(fn (Item $item) => isset($used[$item->id]))->values();
        if ($leftover->isNotEmpty()) {
            $ordered->push([
                'category' => null,
                'items' => $leftover,
                'subcategories' => [],
            ]);
        }

        return $ordered;
    }

    /**
     * The price each item would actually be charged at, keyed by item id.
     *
     * Routed through EffectivePriceService because that is the resolver the
     * order pipeline itself uses (OrderCreationService calls it to set
     * unit_price), and it considers item-level auto-promotions as well as
     * daily specials, taking whichever is lower.
     *
     * Reading the daily-special rows alone — as this page used to — left an
     * item discounted by an auto-promotion advertised at full price on the one
     * menu Google indexes, while the ordering app and the till both charged
     * less. Under-stating a live discount is not a loss, but two prices for
     * one item is an argument at the counter.
     *
     * No N+1: both underlying resolvers read memoised/cached maps rather than
     * querying per item, and variants are eager-loaded by menuItems().
     *
     * @param Collection<int, Item> $items
     * @return array<int, array{price: float, was: float|null, from: bool}>
     */
    private function effectivePrices(Collection $items): array
    {
        $pricing = app(EffectivePriceService::class);

        $out = [];
        foreach ($items as $item) {
            $out[$item->id] = $this->effectivePriceFor($item, $pricing);
        }

        return $out;
    }

    /**
     * Mirrors Item::displayPriceInfo()'s shape and its variant rules, then adds
     * `was` — the pre-discount price, or null when nothing is discounted.
     *
     * A sized item advertises "From" the cheapest variant, so the discount that
     * matters is the one on that variant: resolve every active variant and keep
     * the lowest effective price with its own original beside it. Taking the
     * cheapest variant first and discounting afterwards would show the wrong
     * "was" whenever a promotion targets only the large size.
     *
     * @return array{price: float, was: float|null, from: bool}
     */
    private function effectivePriceFor(Item $item, EffectivePriceService $pricing): array
    {
        $variants = $item->relationLoaded('variants')
            ? $item->variants->where('is_active', true)
            : collect();

        if ($item->has_variants && $variants->isNotEmpty()) {
            $bestPrice = null;
            $bestWas = null;

            foreach ($variants as $variant) {
                $resolved = $pricing->resolveUnitPrice(
                    $item->id,
                    (float) $variant->price,
                    $item,
                    $variant->id,
                );
                if ($bestPrice === null || $resolved->unitPrice < $bestPrice) {
                    $bestPrice = (float) $resolved->unitPrice;
                    $bestWas = $resolved->hasDiscount() ? (float) $resolved->originalPrice : null;
                }
            }

            return ['price' => (float) $bestPrice, 'was' => $bestWas, 'from' => true];
        }

        $resolved = $pricing->resolveUnitPrice($item->id, (float) $item->base_price, $item);

        return [
            'price' => (float) $resolved->unitPrice,
            'was' => $resolved->hasDiscount() ? (float) $resolved->originalPrice : null,
            'from' => false,
        ];
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return array<int, list<array<string, mixed>>>
     */
    private function indexSpecialsByItem(array $rows): array
    {
        $byItem = [];
        foreach ($rows as $row) {
            $itemId = (int) ($row['item_id'] ?? 0);
            if ($itemId < 1) {
                continue;
            }
            $byItem[$itemId][] = $row;
        }

        return $byItem;
    }

    /**
     * One photo per item, same selection as buildItemSlides(source: 'gallery').
     *
     * The Blade used to read thumb_url / image_url only. A photo uploaded to
     * the gallery never reached /menu, while the order app already showed it.
     *
     * `url` is the thumbnail — right for a 132px circle. `full` is the same
     * photo at full size, for JSON-LD: Google wants a large image for rich
     * results and a 400px thumb is a downgrade on what the schema used to
     * carry.
     *
     * @param Collection<int, Item> $items
     * @return array<int, array{url: ?string, webp: ?string, full: ?string, placeholder: bool}>
     */
    /**
     * @param Collection<int, Item> $items
     * @return array<int, array{url: ?string, webp: ?string, full: ?string, placeholder: bool}>
     */
    private function displayPhotos(Collection $items): array
    {
        return app(ItemDisplayPhoto::class)->forItems($items);
    }

    /**
     * @return array<int, array{price: float, was: float|null}>
     */
    private function effectiveVariantPrices(Item $item): array
    {
        $pricing = app(EffectivePriceService::class);
        $out = [];
        $variants = $item->relationLoaded('variants')
            ? $item->variants->where('is_active', true)
            : collect();

        foreach ($variants as $variant) {
            $resolved = $pricing->resolveUnitPrice(
                $item->id,
                (float) $variant->price,
                $item,
                $variant->id,
            );
            $out[$variant->id] = [
                'price' => (float) $resolved->unitPrice,
                'was' => $resolved->hasDiscount() ? (float) $resolved->originalPrice : null,
            ];
        }

        return $out;
    }

    /**
     * Sellable neighbours in the same category — the "still hungry?" strip
     * on an unavailable item's durable page.
     *
     * @return Collection<int, Item>
     */
    private function categoryAlternatives(Item $item): Collection
    {
        if (!$item->category_id) {
            return collect();
        }

        return Item::query()
            ->with(['variants', 'photos'])
            ->where('is_active', true)
            ->where('is_available', true)
            ->where('category_id', $item->category_id)
            ->where('id', '!=', $item->id)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->limit(4)
            ->get();
    }

    private function menuLocale(): string
    {
        return app()->bound('content.locale') ? (string) app('content.locale') : 'en';
    }

    /**
     * Dietary chips to offer, derived from what the items are actually tagged
     * with — never a fixed list.
     *
     * A chip for a tag nothing carries is a control that always returns
     * nothing, which is worse than no control. The order app does the same
     * thing (`MenuQuickFilters` returns null when no item qualifies), so as
     * items get tagged in Content Hub the chips appear here on their own with
     * no code change.
     *
     * Admin tags are free text, so "Gluten Free", "gluten_free" and
     * "gluten-free" must collapse to one chip. Same normalisation as
     * normalizeDietaryTag() in apps/online-order-web/src/pages/MenuPage.tsx.
     *
     * @param Collection<int, Item> $items
     * @return list<array{slug: string, label: string}>
     */
    private function dietaryFilters(Collection $items): array
    {
        $known = [
            'vegetarian' => '🥬 Vegetarian',
            'vegan' => '🌱 Vegan',
            'halal' => '☪ Halal',
            'gluten-free' => '🌾 Gluten-free',
            'spicy' => '🌶 Spicy',
        ];

        $seen = [];
        foreach ($items as $item) {
            foreach ((array) ($item->dietary_tags ?? []) as $raw) {
                $slug = self::dietarySlug((string) $raw);
                if ($slug === '' || isset($seen[$slug])) {
                    continue;
                }
                $seen[$slug] = $known[$slug] ?? ucwords(str_replace('-', ' ', $slug));
            }
        }

        ksort($seen);
        $out = [];
        foreach ($seen as $slug => $label) {
            $out[] = ['slug' => $slug, 'label' => $label];
        }

        return $out;
    }

    /** Free-text admin tag → a stable slug. */
    public static function dietarySlug(string $tag): string
    {
        $slug = strtolower(trim($tag));
        $slug = (string) preg_replace('/[_\s]+/', '-', $slug);
        $slug = (string) preg_replace('/-+/', '-', $slug);

        return trim($slug, '-');
    }

    /**
     * Favourite item ids for the signed-in customer, keyed for O(1) lookup.
     * Empty when nobody is signed in — the heart still renders, as a login link.
     *
     * @return array<int, true>
     */
    private function favouriteItemIds(): array
    {
        $customerId = Auth::guard('customer')->id();
        if (!$customerId) {
            return [];
        }

        $ids = DB::table('customer_favorites')
            ->where('customer_id', $customerId)
            ->pluck('item_id')
            ->all();

        return array_fill_keys(array_map('intval', $ids), true);
    }
}
