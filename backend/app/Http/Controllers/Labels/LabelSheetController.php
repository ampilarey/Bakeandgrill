<?php

declare(strict_types=1);

namespace App\Http\Controllers\Labels;

use App\Domains\Labels\BoxLabel;
use App\Domains\Labels\StickerSheet;
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
            'pdfUrl' => self::link('labels.stickers.pdf', $this->query($request)),
        ]);
    }

    public function stickersPdf(Request $request): Response
    {
        $data = $this->stickerData($request) + ['forPdf' => true, 'autoPrint' => false, 'preview' => false, 'pdfUrl' => ''];
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
            'pdfUrl' => self::link('labels.box.pdf', $request->only(self::BOX_QUERY)),
        ]);
    }

    public function boxPdf(Request $request): Response
    {
        $req = $this->boxRequest($request);
        $name = 'box-label-' . ($req['delivery'] ? (TradeDelivery::query()->whereKey($req['delivery'])->value('delivery_number') ?: $req['delivery']) : ($req['fields']['customer'] !== '' ? \Illuminate\Support\Str::slug($req['fields']['customer']) : 'blank')) . '.pdf';

        return Pdf::loadView('labels.box', ['pieces' => BoxLabel::pieces($req), 'title' => 'Box label', 'forPdf' => true, 'autoPrint' => false, 'pdfUrl' => ''])
            ->setPaper('a4', 'portrait')
            ->setOption('isRemoteEnabled', false)
            ->download($name);
    }

    /** Query keys a box label link carries. */
    public const BOX_QUERY = ['delivery', 'lines', 'articles', 'customer', 'attn', 'contact', 'boat', 'boat2', 'pickup', 'pickup2', 'when', 'when2', 'po', 'box', 'of'];

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
        return $request->only(['items', 'lang', 'layout', 'w', 'h', 'fill', 'mfg', 'exp', 'batch', 'qty', 'pi']);
    }
}
