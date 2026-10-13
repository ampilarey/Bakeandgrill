<?php

declare(strict_types=1);

namespace App\Http\Controllers\Labels;

use App\Domains\Labels\BoxLabel;
use App\Domains\Labels\LabelRaster;
use App\Domains\Labels\StickerSheet;
use App\Domains\Labels\TsplEncoder;
use App\Domains\Labels\ZplEncoder;
use App\Http\Controllers\Controller;
use App\Models\TradeDelivery;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\URL;
use Illuminate\View\View;
use InvalidArgumentException;

/**
 * The printable label sheets, reached only through signed links the Label
 * Hub API issues to staff with labels.print (a new tab carries no bearer
 * token, so the signature is the permission). Links last 30 minutes.
 */
class LabelSheetController extends Controller
{
    public const LINK_MINUTES = 30;

    public function __construct(private readonly StickerSheet $stickers) {}

    public function stickers(Request $request): View
    {
        $data = $this->stickerData($request);

        return view('labels.stickers', $data + [
            'forPdf' => false,
            'autoPrint' => $request->boolean('print'),
            'preview' => $request->boolean('preview'),
            // The hub's live preview shows the first sticker alone, at its own size.
            'one' => $request->boolean('preview') && $request->boolean('one'),
            // The mock-up preview (round 14): that sticker on a jar, bottle, box or lid.
            'mock' => $request->boolean('preview') && $request->boolean('one') ? \App\Domains\Labels\StickerMockup::valid($request->query('mock')) : null,
            'pdfUrl' => self::link('labels.stickers.pdf', $this->query($request)),
        ]);
    }

    public function stickersPdf(Request $request): Response
    {
        $data = $this->stickerData($request) + ['forPdf' => true, 'autoPrint' => false, 'preview' => false, 'one' => false, 'pdfUrl' => ''];
        $sheet = $data['sheet'];
        $pt = 72 / 25.4;
        $name = 'labels-' . (count($data['summary']) === 1 ? \Illuminate\Support\Str::slug($data['summary'][0]['name']) : 'stickers') . '-' . now()->format('Y-m-d') . '.pdf';

        return Pdf::loadView('labels.stickers', $data)
            ->setPaper([0, 0, $sheet['page_w'] * $pt, $sheet['page_h'] * $pt])
            ->setOption('isRemoteEnabled', false)
            ->download($name);
    }

    public function box(Request $request): View
    {
        $req = $this->boxRequest($request);

        return view('labels.box', [
            'pieces' => BoxLabel::pieces($req),
            'title' => 'Box label' . ($req['fields']['customer'] !== '' ? ' – ' . $req['fields']['customer'] : ''),
            'forPdf' => false,
            'autoPrint' => $request->boolean('print'),
            'preview' => $request->boolean('preview'),
            'pdfUrl' => self::link('labels.box.pdf', $request->only(self::BOX_QUERY)),
        ]);
    }

    public function boxPdf(Request $request): Response
    {
        $req = $this->boxRequest($request);
        $name = 'box-label-' . ($req['delivery'] ? (TradeDelivery::query()->whereKey($req['delivery'])->value('delivery_number') ?: $req['delivery']) : ($req['fields']['customer'] !== '' ? \Illuminate\Support\Str::slug($req['fields']['customer']) : 'blank')) . '.pdf';

        return Pdf::loadView('labels.box', ['pieces' => BoxLabel::pieces($req), 'title' => 'Box label', 'forPdf' => true, 'autoPrint' => false, 'preview' => false, 'pdfUrl' => ''])
            ->setPaper('a4', 'portrait')
            ->setOption('isRemoteEnabled', false)
            ->download($name);
    }

    /** Query keys a box label link carries. */
    public const BOX_QUERY = ['delivery', 'lines', 'arts', 'articles', 'customer', 'attn', 'contact', 'boat', 'boat2', 'pickup', 'pickup2', 'when', 'when2', 'po', 'box', 'of', 'storage', 'heading', 'strip'];

    /** @return array<string, mixed> */
    private function boxRequest(Request $request): array
    {
        try {
            return BoxLabel::normalise($request->only(self::BOX_QUERY));
        } catch (InvalidArgumentException $e) {
            abort(422, $e->getMessage());
        }
    }

    /** A signed link to one of the sheet routes, for $minutes. */
    public static function link(string $route, array $query, int $minutes = self::LINK_MINUTES): string
    {
        $query = array_filter($query, fn ($v) => $v !== null && $v !== '' && $v !== false);

        // Relative, so it opens on whichever host the staff member is on.
        return URL::temporarySignedRoute($route, now()->addMinutes($minutes), $query, absolute: false);
    }

    /** @return array<string, mixed> */
    private function stickerData(Request $request): array
    {
        try {
            $req = StickerSheet::normalise($this->query($request));
        } catch (InvalidArgumentException $e) {
            abort(422, $e->getMessage());
        }

        return $this->stickers->build($req);
    }

    /** @return array<string, mixed> */
    private function query(Request $request): array
    {
        return $request->only(['items', 'lang', 'layout', 'w', 'h', 'fill', 'mfg', 'exp', 'batch', 'qty', 'pi', 'type', 'footer', 'rounded', 'b', 'for', 'for2', 'promo', 'promo_was', 'promo_now', 'promo_text', 'number', 'marks', 'bleed', 'runs']);
    }

    // ---- Straight to a label printer (round C, 2026-10-12) ----

    /** The sheet as ZPL, one format per sticker, for a Zebra-language printer. */
    public function stickersZpl(Request $request): Response
    {
        [$labels] = $this->printerLabels($request);

        return response(ZplEncoder::encode($labels), 200, [
            'Content-Type' => 'text/plain; charset=us-ascii',
            'Content-Disposition' => 'attachment; filename="' . $this->printerName($request, 'zpl') . '"',
        ]);
    }

    /** The sheet as TSPL, one job per sticker, for a TSC-language printer. */
    public function stickersTspl(Request $request): Response
    {
        [$labels, $sheet] = $this->printerLabels($request);

        return response(TsplEncoder::encode($labels, (float) $sheet['w'], (float) $sheet['h']), 200, [
            'Content-Type' => 'application/octet-stream',
            'Content-Disposition' => 'attachment; filename="' . $this->printerName($request, 'tspl') . '"',
        ]);
    }

    /** One sticker's bitmap as a PNG (`page`, from 1): what the printer will put on the label. */
    public function stickersPng(Request $request): Response
    {
        $data = $this->printerData($request);
        $page = max(1, $request->integer('page', 1));
        if (!isset($data['pages'][$page - 1])) {
            abort(404, 'That sticker is not on this sheet.');
        }

        return response(LabelRaster::png(LabelRaster::page($data, $page - 1, $this->dpi($request))), 200, [
            'Content-Type' => 'image/png',
            'Cache-Control' => 'private, max-age=600',
        ]);
    }

    /**
     * Every sticker on the sheet as bits at the printer's dots per inch.
     * Identical stickers (copies without numbering) are drawn once.
     *
     * @return array{0: list<array{w: int, h: int, bytes: int, rows: list<string>}>, 1: array<string, mixed>}
     */
    private function printerLabels(Request $request): array
    {
        $data = $this->printerData($request);
        $dpi = $this->dpi($request);
        $labels = [];
        $drawn = [];
        foreach ($data['pages'] as $i => $page) {
            $key = md5(serialize($page));
            $drawn[$key] ??= LabelRaster::page($data, $i, $dpi);
            $labels[] = $drawn[$key];
        }

        return [$labels, $data['sheet']];
    }

    /**
     * The built sheet for a label printer: one sticker a page, without
     * crop marks or a bleed (the label is the page).
     *
     * @return array<string, mixed>
     */
    private function printerData(Request $request): array
    {
        try {
            $req = StickerSheet::normalise($this->query($request) + ['marks' => false, 'bleed' => 0]);
            $req['marks'] = false;
            $req['bleed'] = 0.0;
        } catch (InvalidArgumentException $e) {
            abort(422, $e->getMessage());
        }
        $data = $this->stickers->build($req);
        if ($data['sheet']['per_page'] !== 1) {
            abort(422, 'A label printer takes one sticker a label: pick a label-printer size, not a sheet.');
        }
        if (!LabelRaster::available()) {
            abort(503, 'This server\'s PHP cannot draw text in pictures (GD without FreeType), which the label printer output needs. Print the PDF instead.');
        }

        return $data;
    }

    private function dpi(Request $request): int
    {
        $dpi = $request->integer('dpi', LabelRaster::DEFAULT_DPI);

        return in_array($dpi, LabelRaster::DPIS, true) ? $dpi : LabelRaster::DEFAULT_DPI;
    }

    private function printerName(Request $request, string $ext): string
    {
        return 'labels-' . now()->format('Y-m-d-Hi') . '-' . $this->dpi($request) . 'dpi.' . $ext;
    }
}
