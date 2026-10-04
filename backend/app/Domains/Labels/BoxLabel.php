<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\Item;
use App\Models\TradeDelivery;
use Carbon\CarbonImmutable;
use InvalidArgumentException;

/**
 * The A4 box label (owner's box_label_template.py and box_label_nh_kuda_rah.py;
 * docs/LABEL_HUB_PLAN.md §6.2): who it is for, the boat, pick-up point and
 * delivery window, PO and box numbers, and the contents with a tick box per
 * line. Blank for handwriting, or filled from a wholesale delivery, or any mix:
 * every field is free text the person printing can change.
 */
final class BoxLabel
{
    public const SPARE_ROWS = 3;

    public const TEMPLATE_ROWS = 11;

    private const L = 12.0;

    private const R = 198.0;

    private const IW = 186.0;

    /** Fields a box label takes, all optional. */
    public const FIELDS = ['customer', 'attn', 'contact', 'boat', 'boat2', 'pickup', 'pickup2', 'when', 'when2', 'po', 'box', 'of'];

    /**
     * @param array<string, mixed> $in
     * @return array{delivery: ?int, lines: list<array{id: int, qty: int}>, fields: array<string, string>, articles: bool}
     */
    public static function normalise(array $in): array
    {
        $fields = [];
        foreach (self::FIELDS as $key) {
            $fields[$key] = mb_substr(trim((string) ($in[$key] ?? '')), 0, $key === 'customer' ? 40 : 60);
        }
        $lines = [];
        foreach (StickerSheet::parseItemsAllowZero($in['lines'] ?? []) as $row) {
            $lines[] = ['id' => $row['id'], 'qty' => $row['copies']];
        }
        if (count($lines) > 16) {
            throw new InvalidArgumentException('A box label lists up to 16 lines; split the order across boxes.');
        }

        return [
            'delivery' => isset($in['delivery']) && $in['delivery'] !== '' ? (int) $in['delivery'] : null,
            'lines' => $lines,
            'fields' => $fields,
            'articles' => filter_var($in['articles'] ?? true, FILTER_VALIDATE_BOOL),
        ];
    }

    /**
     * What a wholesale delivery fills in: the shop, its contact, the date, and
     * a line per item sent (quantities included).
     *
     * @return array{fields: array<string, string>, lines: list<array{id: int, qty: int}>}
     */
    public static function fromDelivery(TradeDelivery $delivery): array
    {
        $delivery->loadMissing(['tradeAccount', 'lines']);
        $account = $delivery->tradeAccount;
        $when = $delivery->dispatched_at ? CarbonImmutable::parse($delivery->dispatched_at) : CarbonImmutable::today();
        $lines = [];
        foreach ($delivery->lines as $line) {
            if ($line->item_id) {
                $lines[(int) $line->item_id] = ($lines[(int) $line->item_id] ?? 0) + (int) round((float) $line->qty_sent);
            }
        }

        return [
            'fields' => [
                'customer' => (string) ($account?->shop_name ?? ''),
                'attn' => (string) ($account?->contact_name ?? ''),
                'contact' => (string) ($account?->contact_phone ?? ''),
                'when' => $when->format('D, j M Y'),
                'po' => '',
            ],
            'lines' => array_map(fn ($id, $qty) => ['id' => (int) $id, 'qty' => (int) $qty], array_keys($lines), $lines),
        ];
    }

    /**
     * @param array<string, mixed> $req from normalise()
     * @return list<array<string, mixed>> pieces on an A4 page, in mm
     */
    public static function pieces(array $req): array
    {
        $f = $req['fields'];
        $common = app(StickerSheet::class)->common();
        $c = $common['contact'];
        $items = Item::query()->whereIn('id', array_column($req['lines'], 'id'))->get()->keyBy('id');
        $lines = [];
        foreach ($req['lines'] as $row) {
            if ($item = $items->get($row['id'])) {
                $lines[] = ['name' => (string) $item->name, 'article' => 'FROZEN - SHORT EAT - ' . mb_strtoupper((string) $item->name) . '-PIECE', 'qty' => $row['qty']];
            }
        }
        $articles = $req['articles'] && $lines !== [];
        $L = self::L;
        $R = self::R;
        $IW = self::IW;
        $P = StickerDesign::PRIMARY;
        $D = StickerDesign::DARK;
        $p = [];
        $line = fn (float $x1, float $x2, float $y, string $col = StickerDesign::SOFT, float $sw = 0.32) => ['t' => 'line', 'x' => $x1, 'y' => $y, 'w' => $x2 - $x1, 'color' => $col, 'sw' => $sw];
        $text = fn (float $x, float $base, float $w, string $align, string $font, float $pt, string $color, string $t) => ['t' => 'text', 'x' => $x, 'base' => $base, 'w' => $w, 'align' => $align, 'font' => $font, 'pt' => $pt, 'color' => $color, 'text' => $t];

        // Header with the logo, name, tagline and the KEEP FROZEN badge.
        $p[] = ['t' => 'rect', 'x' => $L, 'y' => 12, 'w' => $IW, 'h' => 34, 'fill' => StickerDesign::TINT, 'r' => 4];
        [$lw, $lh] = StickerDesign::fit($common['logo_ratio'], 28, 28);
        if ($common['logo']) {
            $p[] = ['t' => 'img', 'x' => $L + 5, 'y' => 12 + (34 - $lh) / 2, 'w' => $lw, 'h' => $lh, 'src' => $common['logo']];
        }
        $p[] = $text($L + 38, 27, 95, 'l', 'ds', 28, $D, $c['name']);
        $p[] = $text($L + 38, 34.5, 95, 'l', 'dsi', 13, $P, $c['tagline']);
        $p[] = $text($L + 38, 40.5, 95, 'l', 'j5', 8.5, StickerDesign::MUTED, LabelSettings::get('label_box_heading'));
        $p[] = ['t' => 'rect', 'x' => $R - 50, 'y' => 18, 'w' => 44, 'h' => 22, 'fill' => $P, 'r' => 3];
        $p[] = $text($R - 50, 25, 44, 'c', 'j8', 11, StickerDesign::CREAM, 'KEEP FROZEN');
        $p[] = $text($R - 50, 34.5, 44, 'c', 'j8', 20, StickerDesign::CREAM, '-18°C');

        // Deliver to.
        $p[] = $text($L, 57, 80, 'l', 'j7', 10, $P, 'D E L I V E R   T O');
        if ($f['customer'] !== '') {
            $p[] = $text($L - 0.35, 76, $IW, 'l', 'ds', LabelText::fitPt($f['customer'], 'ds', $IW, 54, 26), $D, $f['customer']);
            $p[] = ['t' => 'rect', 'x' => $L, 'y' => 79.1, 'w' => 30, 'h' => 1.4, 'fill' => $P];
        } else {
            $p[] = $line($L, $R, 77, $D, 0.49);
        }
        if ($f['attn'] !== '' || $f['contact'] !== '') {
            $p[] = $text($L, 88, $IW, 'l', 'j7', 12, StickerDesign::TEXT, 'Attn: ' . ($f['attn'] !== '' ? $f['attn'] : '______________'));
            $p[] = $text($L, 94, $IW, 'l', 'j4', 10.5, StickerDesign::MUTED, $f['contact']);
        } else {
            $p[] = $text($L, 88, 20, 'l', 'j7', 11, StickerDesign::TEXT, 'Attn:');
            $p[] = $line($L + 12, $L + $IW * 0.55, 88.5);
            $p[] = $text($L + $IW * 0.58, 88, 20, 'l', 'j7', 11, StickerDesign::TEXT, 'Tel:');
            $p[] = $line($L + $IW * 0.58 + 10, $R, 88.5);
            $p[] = $text($L, 94.5, 40, 'l', 'j4', 10.5, StickerDesign::MUTED, 'Address / Resort:');
            $p[] = $line($L + 32, $R, 95);
        }

        // Boat, pick-up point, delivery: written in, or lines to write on.
        $cw = ($IW - 8) / 3;
        $cells = [
            [$f['boat'] !== '' || $f['boat2'] !== '' ? 'BOAT' : 'BOAT / VESSEL', $f['boat'], $f['boat2']],
            ['PICK-UP POINT', $f['pickup'], $f['pickup2']],
            [$f['when'] !== '' || $f['when2'] !== '' ? 'DELIVERY' : 'DELIVERY DATE & TIME', $f['when'], $f['when2']],
        ];
        foreach ($cells as $i => [$label, $v1, $v2]) {
            $x = $L + $i * ($cw + 4);
            $p[] = ['t' => 'rect', 'x' => $x, 'y' => 99, 'w' => $cw, 'h' => 21, 'fill' => StickerDesign::CREAM, 'stroke' => $D, 'sw' => 0.49, 'r' => 3];
            $p[] = $text($x + 4, 105, $cw - 8, 'l', 'j7', 8, $P, $label);
            if ($v1 === '' && $v2 === '') {
                $p[] = $line($x + 4, $x + $cw - 4, 111.5);
                $p[] = $line($x + 4, $x + $cw - 4, 117);
            } else {
                $p[] = $text($x + 4, 111.8, $cw - 8, 'l', 'j8', LabelText::fitPt($v1, 'j8', $cw - 8, mb_strlen($v1) < 12 ? 14 : 12.5, 9), $D, $v1);
                $p[] = $text($x + 4, 117, $cw - 8, 'l', 'j5', LabelText::fitPt($v2, 'j5', $cw - 8, 10, 7.5), StickerDesign::TEXT, $v2);
            }
        }

        // PO and box numbers.
        $po = 'PO NO:';
        $poW = LabelText::widthMm($po, 10.5, 'j7');
        $p[] = $text($L, 127.5, 30, 'l', 'j7', 10.5, StickerDesign::TEXT, $po);
        $f['po'] !== ''
            ? $p[] = $text($L + $poW + 2, 127.5, 70, 'l', 'j5', 10.5, StickerDesign::TEXT, $f['po'])
            : $p[] = $line($L + $poW + 2, $L + $poW + 42, 127.85);
        $bx = $L + $IW * 0.56;
        $p[] = $text($bx, 127.5, 12, 'l', 'j7', 10.5, StickerDesign::TEXT, 'BOX');
        $f['box'] !== '' ? $p[] = $text($bx + 10, 127.5, 14, 'c', 'j7', 10.5, StickerDesign::TEXT, $f['box']) : $p[] = $line($bx + 10, $bx + 24, 127.85);
        $p[] = $text($bx + 26, 127.5, 8, 'l', 'j7', 10.5, StickerDesign::TEXT, 'OF');
        $f['of'] !== '' ? $p[] = $text($bx + 33, 127.5, 14, 'c', 'j7', 10.5, StickerDesign::TEXT, $f['of']) : $p[] = $line($bx + 33, $bx + 47, 127.85);

        // Contents.
        $p[] = $text($L, 137, 80, 'l', 'j7', 10, $P, 'C O N T E N T S');
        $cols = [$L + 4, $L + 60, $R - 42, $R - 14];
        $rows = $lines === [] ? self::TEMPLATE_ROWS : count($lines) + self::SPARE_ROWS;
        $rh = min(7.3, (237 - 147.8) / max(1, $rows));
        $p[] = ['t' => 'rect', 'x' => $L, 'y' => 140.5, 'w' => $IW, 'h' => 7.3, 'fill' => $D, 'r' => 2, 'rb' => 0];
        $p[] = $text($cols[0], 145.7, 40, 'l', 'j7', 8.5, StickerDesign::CREAM, 'ITEM');
        if ($articles) {
            $p[] = $text($cols[1], 145.7, 60, 'l', 'j7', 8.5, StickerDesign::CREAM, 'ARTICLE NAME');
        }
        $p[] = $text($cols[2] - 22, 145.7, 40, 'r', 'j7', 8.5, StickerDesign::CREAM, 'QTY (PCS)');
        $p[] = $text($cols[3] - 10, 145.7, 20, 'c', 'j7', 8.5, StickerDesign::CREAM, 'CHECK');
        $y = 147.8;
        for ($i = 0; $i < $rows; $i++) {
            if ($i % 2 === 0) {
                $p[] = ['t' => 'rect', 'x' => $L, 'y' => $y, 'w' => $IW, 'h' => $rh, 'fill' => StickerDesign::TINT];
            }
            $base = $y + $rh * (5 / 7.3);
            $row = $lines[$i] ?? null;
            if ($row) {
                $p[] = $text($cols[0], $base, 54, 'l', 'j7', $rh < 6.5 ? 9.5 : 10.5, $D, $row['name']);
                if ($articles) {
                    $p[] = $text($cols[1], $base, $cols[2] - $cols[1] - 4, 'l', 'j4', LabelText::fitPt($row['article'], 'j4', $cols[2] - $cols[1] - 6, 7.3, 5.6), StickerDesign::MUTED, $row['article']);
                }
            } else {
                $articles
                    ? array_push($p, $line($cols[0], $cols[1] - 6, $base + 0.18), $line($cols[1], $cols[2] - 4, $base + 0.18))
                    : $p[] = $line($cols[0], $cols[2] - 10, $base + 0.18);
            }
            $row && $row['qty'] > 0
                ? $p[] = $text($cols[2] + 2, $base, 16, 'r', 'j8', 10.5, $D, (string) $row['qty'])
                : $p[] = $line($cols[2] + 2, $cols[2] + 18, $base + 0.18);
            $box = min(4.4, $rh - 1.6);
            $p[] = ['t' => 'rect', 'x' => $cols[3] - $box / 2, 'y' => $y + ($rh - $box) / 2, 'w' => $box, 'h' => $box, 'stroke' => $D, 'sw' => 0.35];
            $y += $rh;
        }
        $p[] = $line($L, $R, $y, $D, 0.42);
        $p[] = $text($cols[0], $y + 6.5, 40, 'l', 'j8', 11.5, $D, 'TOTAL');
        $total = array_sum(array_column($lines, 'qty'));
        $total > 0 && count(array_filter($lines, fn ($l) => $l['qty'] > 0)) === count($lines)
            ? $p[] = $text($cols[2] + 2, $y + 6.5, 16, 'r', 'j8', 11.5, $D, (string) $total)
            : $p[] = $line($cols[2] + 2, $cols[2] + 18, $y + 7, $D, 0.35);

        // Handling strip and footer.
        $strip = LabelSettings::get('label_box_strip');
        $p[] = ['t' => 'rect', 'x' => $L, 'y' => 246, 'w' => $IW, 'h' => 10, 'fill' => $P, 'r' => 2.5];
        $p[] = $text($L, 252.4, $IW, 'c', 'j8', LabelText::fitPt($strip, 'j8', $IW - 8, 11, 7), StickerDesign::CREAM, $strip);
        $p[] = ['t' => 'rect', 'x' => $L, 'y' => 261, 'w' => $IW, 'h' => 24, 'fill' => $D, 'r' => 4];
        [$mw, $mh] = StickerDesign::fit($common['mark_ratio'], 15, 16);
        if ($common['mark']) {
            $p[] = ['t' => 'img', 'x' => $L + 6, 'y' => 261 + (24 - $mh) / 2, 'w' => $mw, 'h' => $mh, 'src' => $common['mark']];
        }
        $tx = $L + 6 + $mw + 4;
        $p[] = $text($tx, 270, 90, 'l', 'ds', 18, StickerDesign::CREAM, $c['name']);
        $p[] = $text($tx, 275.5, 90, 'l', 'dsi', 10.5, StickerDesign::ON_DARK, $c['tagline']);
        $p[] = $text($tx, 280.5, 100, 'l', 'j4', 8, StickerDesign::SOFT, trim($c['address'] . ($c['landmark'] !== '' ? '  ·  ' . $c['landmark'] : '')));
        $p[] = $text($R - 86, 270, 80, 'r', 'j8', 16, StickerDesign::CREAM, $c['phone']);
        $p[] = $text($R - 86, 275, 80, 'r', 'j7', 7.5, StickerDesign::ON_DARK, LabelSettings::get('label_contact_ways'));
        $p[] = $text($R - 86, 280.7, 80, 'r', 'dsi', 13, StickerDesign::CREAM, $c['website']);

        return $p;
    }
}
