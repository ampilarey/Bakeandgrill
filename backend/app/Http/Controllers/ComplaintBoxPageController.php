<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\ComplaintBoxEntry;
use App\Support\BrandMark;
use App\Support\ComplaintBoxLink;
use App\Support\PosterCardSpec;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\View\View;

/**
 * The public complaint form and the poster that points at it.
 *
 * Owner, 2026-09-19: an easy way for customers to complain about staff or
 * food, anonymously or with a mobile number, separate from the receipt.
 */
class ComplaintBoxPageController extends Controller
{
    public function show(Request $request): View
    {
        $orderRef = trim((string) $request->query('order', ''));
        $source = in_array($request->query('from'), ComplaintBoxEntry::SOURCES, true) ? (string) $request->query('from') : 'web';

        return view('complain', [
            'categories' => ComplaintBoxEntry::categoryOptions(),
            'staffCategories' => ComplaintBoxEntry::STAFF_CATEGORIES,
            'maxCategories' => ComplaintBoxEntry::MAX_CATEGORIES,
            'orderRef' => mb_substr($orderRef, 0, 40),
            'source' => $source,
            'endpoint' => url('/api/complaint-box'),
        ]);
    }

    /**
     * A printable A5 card with the QR, for the counter and the tables.
     *
     * Owner, 2026-09-19: "Qr code should be of live site, and add logo", then
     * "remove the logo from the top and make the logo inside the qr code
     * bigger". The address and the logo come from ComplaintBoxLink so the
     * receipt carries the same code.
     */
    public function poster(): View
    {
        $url = ComplaintBoxLink::url('poster');

        return view('complain-poster', [
            'url' => $url,
            // A third of the width, as it has been on the wall since
            // 2026-09-19 ("make the logo inside the qr code bigger") — the
            // mark is inside the code's SVG now rather than laid over it.
            // Deep brand brown rather than black (owner, 2026-10-03: "too much
            // black"); 11:1 against white, so it scans like a black code.
            'qr' => ComplaintBoxLink::qr($url, 480, 0.33, '#5A260A'),
            'siteName' => (string) content('site_name', 'Bake & Grill'),
            // Owner, 2026-10-03: "enhance the complaint QR print layout with
            // branding, like a header or footer". The header carries the logo,
            // name and tagline; the footer how else to reach the business.
            'logo' => ComplaintBoxLink::logo(),
            'tagline' => trim((string) content('site_tagline', '')),
            'contacts' => self::posterContacts(),
            'layouts' => array_filter(self::LAYOUTS, fn (array $l, string $key) => self::card($key)['spec']['fits'], ARRAY_FILTER_USE_BOTH),
        ]);
    }

    /**
     * Owner, 2026-10-03: "Add option to download different sizes. Like A4,
     * A5, 2 posters in 1 A4, 4, 6, 9, etc." One card on a sheet of any size,
     * or several on one A4 to cut apart. Each entry: the paper, its
     * orientation, and how many columns and rows of cards it holds.
     *
     * @var array<string, array{label: string, hint: string, paper: string, orient: string, cols: int, rows: int, whole?: bool}>
     */
    public const LAYOUTS = [
        'a3' => ['label' => 'A3 poster', 'hint' => '1 large poster', 'paper' => 'a3', 'orient' => 'portrait', 'cols' => 1, 'rows' => 1],
        'a4' => ['label' => 'A4', 'hint' => '1 per sheet', 'paper' => 'a4', 'orient' => 'portrait', 'cols' => 1, 'rows' => 1],
        'a5' => ['label' => 'A5', 'hint' => '1 per sheet', 'paper' => 'a5', 'orient' => 'portrait', 'cols' => 1, 'rows' => 1],
        'a6' => ['label' => 'A6', 'hint' => '1 per sheet', 'paper' => 'a6', 'orient' => 'portrait', 'cols' => 1, 'rows' => 1],
        'a4-2' => ['label' => '2 on A4', 'hint' => 'A5 size each', 'paper' => 'a4', 'orient' => 'landscape', 'cols' => 2, 'rows' => 1],
        'a4-4' => ['label' => '4 on A4', 'hint' => 'A6 size each', 'paper' => 'a4', 'orient' => 'portrait', 'cols' => 2, 'rows' => 2],
        'a4-6' => ['label' => '6 on A4', 'hint' => 'table cards', 'paper' => 'a4', 'orient' => 'landscape', 'cols' => 3, 'rows' => 2],
        // Owner, 2026-10-03: "20 is too much — font size should be 12, or 10
        // at the minimum", then "keep the same poster, with the same header
        // and footer, without any change, even at 12 or 9 per page". With the
        // whole header and footer on every card and nothing under 10pt, six
        // is the most an A4 holds (see PosterCardSpec). Then: "Make 9 and 12
        // per page also, without changing anything" — so these two carry the
        // same card as the 6-up and let the type go under 10pt to fit it.
        'a4-9' => ['label' => '9 on A4', 'hint' => 'small table cards, smaller text', 'paper' => 'a4', 'orient' => 'portrait', 'cols' => 3, 'rows' => 3, 'whole' => true],
        'a4-12' => ['label' => '12 on A4', 'hint' => 'stickers, smallest text', 'paper' => 'a4', 'orient' => 'portrait', 'cols' => 3, 'rows' => 4, 'whole' => true],
    ];

    /** Sheet sizes in mm, portrait. */
    private const PAPER_MM = ['a3' => [297, 420], 'a4' => [210, 297], 'a5' => [148, 210], 'a6' => [105, 148]];

    /** Unprintable edge most office printers leave; the cards sit inside it. */
    private const MARGIN_MM = 6;

    /** The chosen layout as a printable sheet; ?print=1 opens the print dialog. */
    public function sheet(Request $request): View
    {
        return view('complain-poster-sheet', $this->sheetData($request) + ['forPdf' => false, 'autoPrint' => $request->boolean('print')]);
    }

    /** The same sheet as a PDF download. */
    public function sheetPdf(Request $request): Response
    {
        $data = $this->sheetData($request) + ['forPdf' => true, 'autoPrint' => false];

        return Pdf::loadView('complain-poster-sheet', $data)
            ->setPaper($data['layout']['paper'], $data['layout']['orient'])
            ->download('complaint-qr-' . $data['layoutKey'] . '.pdf');
    }

    /** @return array<string, mixed> */
    private function sheetData(Request $request): array
    {
        $key = (string) $request->query('layout', 'a5');
        // An unknown size, or one the card does not fit at with today's
        // details (a long address, say), falls back to A5 rather than failing.
        if (!isset(self::LAYOUTS[$key]) || !self::card($key)['spec']['fits']) {
            $key = 'a5';
        }
        $card = self::card($key);
        [$w, $h] = $card['sheetMm'];
        [$cardW, $cardH] = $card['cardMm'];
        $layout = self::LAYOUTS[$key];
        $spec = $card['spec'];
        $url = ComplaintBoxLink::url('poster');
        $logo = $card['logo'];
        $siteName = $card['siteName'];
        $tagline = $card['tagline'];
        $contacts = $card['contacts'];
        $displayUrl = $card['displayUrl'];

        return [
            'spec' => $spec,
            'displayUrl' => $displayUrl,
            'layoutKey' => $key,
            'layout' => $layout,
            'sheetMm' => [$w, $h],
            'marginMm' => self::MARGIN_MM,
            'cardMm' => [$cardW, $cardH],
            'url' => $url,
            'qr' => ComplaintBoxLink::qr($url, 480, 0.33, '#5A260A'),
            'logo' => $logo,
            'siteName' => $siteName,
            'tagline' => $tagline,
            'contacts' => $contacts,
        ];
    }

    /**
     * One layout's sheet and card size, and how the card lays out at that size
     * with the business details as they are today.
     *
     * @return array{sheetMm: array{float, float}, cardMm: array{float, float}, spec: array<string, mixed>, logo: ?string, siteName: string, tagline: string, contacts: array{line: list<string>, address: string}, displayUrl: string}
     */
    private static function card(string $key): array
    {
        $layout = self::LAYOUTS[$key];
        [$w, $h] = self::PAPER_MM[$layout['paper']];
        if ($layout['orient'] === 'landscape') {
            [$w, $h] = [$h, $w];
        }
        // Slack for the dashed cut lines, which add their own width per row
        // and column; without it the last line spills onto a second page.
        $slack = fn (int $n): float => 0.5 + 0.3 * ($n + 1);
        $cardW = round(($w - 2 * self::MARGIN_MM - $slack($layout['cols'])) / $layout['cols'], 2);
        $cardH = round(($h - 2 * self::MARGIN_MM - $slack($layout['rows'])) / $layout['rows'], 2);
        $url = ComplaintBoxLink::url('poster');
        // A PNG the PDF renderer can draw (the stored logo may be WebP).
        $logo = BrandMark::dataUri(240);
        $siteName = (string) content('site_name', 'Bake & Grill');
        $tagline = trim((string) content('site_tagline', ''));
        $contacts = self::posterContacts();
        $displayUrl = (string) preg_replace('#^https?://#', '', (string) preg_replace('#\?.*$#', '', $url));
        $text = [
            'name' => $siteName,
            'tagline' => $tagline,
            'url' => $displayUrl,
            'contact' => implode('  ·  ', $contacts['line']),
            'address' => $contacts['address'],
        ];

        return [
            'sheetMm' => [$w, $h],
            'cardMm' => [$cardW, $cardH],
            'spec' => ($layout['whole'] ?? false)
                ? PosterCardSpec::whole($cardW, $cardH, $text, $logo !== null)
                : PosterCardSpec::for($cardW, $cardH, $text, $logo !== null),
            'logo' => $logo,
            'siteName' => $siteName,
            'tagline' => $tagline,
            'contacts' => $contacts,
            'displayUrl' => $displayUrl,
        ];
    }

    /**
     * The footer line: phone, website and Instagram, whichever are set, then
     * the address. Empty entries are left out so a half-filled profile
     * prints a short line rather than labels with nothing after them.
     *
     * @return array{line: list<string>, address: string}
     */
    private static function posterContacts(): array
    {
        $line = [];
        $phone = trim((string) content('business_phone', ''));
        if ($phone !== '') {
            $line[] = $phone;
        }
        $site = trim((string) content('business_website', ''));
        if ($site === '') {
            $site = (string) parse_url((string) config('app.url'), PHP_URL_HOST);
        }
        $site = preg_replace('#^https?://(www\.)?#i', '', rtrim($site, '/')) ?? '';
        if ($site !== '') {
            $line[] = $site;
        }
        $instagram = trim((string) content('social_instagram', ''));
        if ($instagram !== '') {
            // Stored as a URL ("https://instagram.com/bakeandgrill/"); printed as a handle.
            $handle = trim((string) (parse_url($instagram, PHP_URL_PATH) ?: $instagram), '/@ ');
            $handle = explode('/', $handle)[0] ?? '';
            if ($handle !== '' && !str_contains($handle, '.')) {
                $line[] = '@' . $handle;
            }
        }

        $address = implode(', ', array_filter([
            trim((string) content('business_address_line1', '')),
            trim((string) content('business_address_city', '')),
        ], fn (string $s) => $s !== ''));
        if ($address === '') {
            $address = trim((string) content('business_address', ''));
        }

        return ['line' => $line, 'address' => $address];
    }
}
