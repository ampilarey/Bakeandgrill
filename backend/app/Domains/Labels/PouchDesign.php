<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use Illuminate\Support\Facades\Cache;

/**
 * The pouch label (owner, 2026-11-11: the frozen momo's zip pouch): a
 * landscape front-of-pack label. Top left the dish in a circle; beside it the
 * brand's logo, the name in a script face, a tagline, a pill saying how it is
 * cooked and the phone; on the right a panel with the pack size, the count
 * and the price; along the bottom a strip with the ingredients (allergens
 * bold), how to use, the storage line with the dates, the complaints QR, and
 * a line saying who made it, always Bake & Grill.
 *
 * What it looks like and how the food is cooked are the product's picks
 * (PouchConfig): a palette per pouch colour, a method per pill. Everything
 * else is the label's ordinary data, so a new product needs no new design.
 *
 * Drawn from filled boxes, pictures and text only: no outlines (the thermal
 * rasteriser draws a rounded outline square), and the photo is cut to a
 * circle here because no renderer clips a picture.
 */
final class PouchDesign
{
    /** @var list<array<string, mixed>> */
    private array $p = [];

    /** The label's scale against the 62 mm tall medium pouch label. */
    private float $u;

    /** @var array<string, mixed> */
    private array $c;

    /** @var array{look: string, method: string, method_text: string, method_text_dv: string, tagline: string, tagline_dv: string, size_word: string, pack_place: string} */
    private array $cfg;

    private bool $both;

    /** @param array<string, mixed> $d */
    private function __construct(private readonly array $d, private readonly bool $dv, private readonly float $w, private readonly float $h)
    {
        $this->u = self::clamp($h / 62.0, 0.66, 1.5);
        $this->cfg = is_array($d['pouch'] ?? null) ? $d['pouch'] : PouchConfig::clean([]);
        $this->c = PouchConfig::LOOKS[$this->cfg['look']] ?? PouchConfig::LOOKS[PouchConfig::DEFAULT_LOOK];
        $this->both = !$dv && !empty($d['both']);
    }

    /**
     * @param array<string, mixed> $d from StickerSheet::stickerData(), with `pouch`
     * @return list<array<string, mixed>>
     */
    public static function pouch(array $d, bool $dv, float $w, float $h): array
    {
        $s = new self($d, $dv, $w, $h);
        $s->draw();

        return $s->p;
    }

    /** The how-to-use wording a pouch label prints: the label's own, else its cooking method's. */
    public static function howToUse(array $d, bool $dv): string
    {
        $own = trim((string) ($dv ? ($d['how_to_use_dv'] ?? '') : ($d['how_to_use'] ?? '')));
        if ($own !== '' || $dv) {
            return $own;
        }
        $method = (string) ($d['pouch']['method'] ?? '');

        return (string) (PouchConfig::METHODS[$method][3] ?? '');
    }

    private function draw(): void
    {
        $u = $this->u;
        $c = $this->c;
        $w = $this->w;
        $h = $this->h;
        $bw = 0.9 * $u;
        $gap = 0.5 * $u;
        $sh = round($h * 0.36, 2);
        $topH = $h - 2 * $bw - $sh - $gap;
        // A barcode needs a wider panel to scan.
        $panelW = !empty($this->d['barcode']) ? self::clamp($w * 0.25, 31.0, 40.0) : self::clamp($w * 0.2, 19.0, 36.0);
        $panelX = $w - $bw - $panelW;

        // The frame, the cream field, the panel and the strip.
        $this->box(0, 0, $w, $h, $c['border'], 2.4 * $u);
        $this->box($bw, $bw, $panelX - $bw, $topH, $c['bg'], 1.5 * $u);
        $this->box($panelX, $bw, $panelW, $topH, $c['panel'], 1.5 * $u);
        $this->box($bw, $h - $bw - $sh, $w - 2 * $bw, $sh, $c['strip'], 1.5 * $u);

        // The dish in its ring.
        $x = $bw + 2.0 * $u;
        $photo = $this->d['photo'] ?? null;
        if (is_string($photo) && $photo !== '') {
            $dia = $topH - 3.2 * $u;
            $py = $bw + ($topH - $dia) / 2;
            $this->p[] = LabelSpots::open('photo');
            $this->box($x, $py, $dia, $dia, $c['border'], $dia / 2);
            $in = 0.55 * $u;
            $this->box($x + $in, $py + $in, $dia - 2 * $in, $dia - 2 * $in, $c['ring'], ($dia - 2 * $in) / 2);
            $in += 0.85 * $u;
            $this->img($x + $in, $py + $in, $dia - 2 * $in, $dia - 2 * $in, self::circle($photo));
            $this->p[] = LabelSpots::close();
            $pack = $this->packWords();
            if ($pack !== '' && $this->packPlace() === 'badge') {
                // A round sticker on the photo's shoulder: "SMALL" over "PACK".
                $bd = $dia * 0.44;
                $bx = $x + $dia - $bd * 0.9;
                $by = $py + $dia - $bd * 0.92;
                $this->box($bx, $by, $bd, $bd, $c['bg'], $bd / 2);
                $rim = 0.5 * $u;
                $this->box($bx + $rim, $by + $rim, $bd - 2 * $rim, $bd - 2 * $rim, $c['accent'], ($bd - 2 * $rim) / 2);
                $parts = explode(' ', mb_strtoupper($pack), 2);
                $tw = $bd * 0.74;
                $pt1 = LabelText::fitPt($parts[0], 'j8', $tw, $bd * 0.3 / LabelText::PT, 3.6);
                $this->text($bx + ($bd - $tw) / 2, $this->baseCentred($by + $bd * 0.2, $bd * 0.32, 'j8', $pt1), $tw, 'c', 'j8', $pt1, $c['bg'], $parts[0]);
                if (isset($parts[1])) {
                    $pt2 = LabelText::fitPt($parts[1], 'j8', $tw, $bd * 0.2 / LabelText::PT, 3.4);
                    $this->text($bx + ($bd - $tw) / 2, $this->baseCentred($by + $bd * 0.52, $bd * 0.24, 'j8', $pt2), $tw + 0.1 * $pt2 * LabelText::PT, 'c', 'j8', $pt2, $c['bg'], $parts[1], 0.0, [], 0.1);
                }
            }
            $x += $dia + 2.6 * $u;
        } else {
            $x += 1.0 * $u;
        }

        $this->middle($x, $bw, $panelX - 2.0 * $u - $x, $topH);
        $this->panel($panelX, $bw, $panelW, $topH);
        $this->strip($bw, $h - $bw - $sh, $w - 2 * $bw, $sh);
    }

    /** The logo, the name, the tagline, and the cooking pill with the phone. */
    private function middle(float $x, float $y, float $mw, float $mh): void
    {
        $d = $this->d;
        $c = $this->c;
        $u = $this->u;
        $logoH = $mh * 0.2;
        $nameH = $mh * 0.33;
        $tagH = $mh * 0.11;
        $pillH = $mh * 0.19;
        // The line under the name: the pouch's own, else a heading typed for this label or its type. Never the
        // storage's stock heading ("FROZEN HEDHIKA" on a momo), and never the name over again (audit, 2026-11-11).
        $heading = $this->dv
            ? (empty($d['heading_stock_dv']) ? (string) ($d['header_line_dv'] ?? '') : '')
            : (empty($d['heading_stock']) ? (string) ($d['header_line'] ?? '') : '');
        $tagline = $this->dv ? ($this->cfg['tagline_dv'] !== '' ? $this->cfg['tagline_dv'] : $heading)
            : ($this->cfg['tagline'] !== '' ? $this->cfg['tagline'] : $heading);
        $plain = fn (string $t): string => preg_replace('/[^\p{L}\p{N}]+/u', '', mb_strtolower($t)) ?? '';
        $shown = PouchSet::printName((string) ($this->dv && trim((string) ($d['name_dv'] ?? '')) !== '' ? $d['name_dv'] : $d['name']), $this->cfg['size_word']);
        if ($plain($tagline) === $plain($shown) || $plain($tagline) === $plain((string) $d['name'])) {
            $tagline = '';
        }
        $pill = $this->pillWords();
        $badges = is_array($d['badges'] ?? null) ? $d['badges'] : [];
        $promo = is_array($d['promo'] ?? null) ? $d['promo'] : null;
        // Rows left out give their room to the name.
        if ($tagline === '') {
            $nameH += $tagH;
            $tagH = 0.0;
        }
        if ($pill === '' && $badges === []) {
            $nameH += $pillH;
            $pillH = 0.0;
        }
        // Bake & Grill's own logo and name sit in the strip beside the ingredients (owner, 2026-11-11);
        // only another food brand (Amma) keeps its logo up here, and the name takes the room otherwise.
        $topBrand = empty($d['brand']['is_default']);
        if (!$topBrand) {
            $nameH += $logoH * 0.8;
            $logoH = 0.0;
        }
        $free = $mh - $logoH - $nameH - $tagH - $pillH;
        $g = $free / ($topBrand ? 5 : 4);
        $cy = $y + $g * ($topBrand ? 1.25 : 1.1);

        if ($topBrand) {
            // The brand's logo on a plate that keeps it readable on any look.
            $logo = $d['brand']['logo'] ?? null;
            $ratio = (float) ($d['brand']['logo_ratio'] ?? 1.0);
            $this->p[] = LabelSpots::open('brand');
            if (is_string($logo) && $logo !== '') {
                $lw = min($mw, $logoH * $ratio);
                $lh = $lw / max(0.1, $ratio);
                $this->img($this->dv ? $x + $mw - $lw : $x, $cy + ($logoH - $lh) / 2, $lw, $lh, $logo);
                // A logo that is a mark (the flame) gets the brand's name beside it; a wide one already says it.
                $name = mb_strtoupper(trim((string) ($d['brand']['name'] ?? '')));
                if ($ratio < 2.0 && $name !== '' && !$this->dv) {
                    $ls = 0.16;
                    $room = $mw - $lw - 1.6 * $u;
                    $pt = LabelText::fitPt($name, 'j8', $room / (1 + $ls * 1.15), $logoH * 0.5 / LabelText::PT, 4.0);
                    $this->text($x + $lw + 1.6 * $u, $this->baseCentred($cy, $logoH, 'j8', $pt), $room, 'l', 'j8', $pt, $c['ink'], $name, 0.0, [], $ls);
                }
            } else {
                $name = mb_strtoupper((string) ($d['brand']['name'] ?? ''));
                $pt = LabelText::fitPt($name, 'j8', $mw, $logoH * 0.62 / LabelText::PT, 4.0);
                $this->text($x, $this->baseCentred($cy, $logoH, 'j8', $pt), $mw, $this->a('l'), 'j8', $pt, $c['ink'], $name, 0.0, [], 0.12);
            }
            $this->p[] = LabelSpots::close();
            $cy += $logoH + $g;
        }

        // A promotion flash in the field's top corner; the name gives it the room.
        $nw = $mw;
        if ($promo !== null) {
            $fw = min(20.0 * $u, $mw * 0.3);
            $fh = min($nameH * 0.92, $fw * 0.78);
            $this->p[] = LabelSpots::open('promo');
            array_push($this->p, ...StickerDesign::flash($promo, round($this->dv ? $x : $x + $mw - $fw, 3), round($cy + ($nameH - $fh) / 2, 3), round($fw, 3), round($fh, 3)));
            $this->p[] = LabelSpots::close();
            $nw = $mw - $fw - 1.6 * $u;
        }
        $nx = $this->dv && $promo !== null ? $x + $mw - $nw : $x;

        // The name: hand-lettered when the label has a title picture, else the script face.
        $this->p[] = LabelSpots::open('name');
        $title = $d['title_img'] ?? null;
        $nameDv = trim((string) ($d['name_dv'] ?? ''));
        if (is_string($title) && $title !== '' && !$this->dv) {
            $tr = max(0.1, (float) ($d['title_ratio'] ?? 1.0));
            $tw = min($nw, $nameH * $tr);
            $this->img($nx, $cy + ($nameH - $tw / $tr) / 2, $tw, $tw / $tr, $title);
        } elseif ($this->dv && $nameDv !== '') {
            [$pt, $lines] = $this->fitLines($nameDv, 'dv', $nw, $nameH, $nameH * 0.8 / LabelText::PT, 7.0, 2);
            $this->lines($lines, 'dv', $pt, $nx, $cy, $nw, $nameH, 'r', $c['ink'], 0.7);
        } else {
            $enH = $this->both && $nameDv !== '' ? $nameH * 0.64 : $nameH;
            [$pt, $lines] = $this->fitLines(PouchSet::printName((string) $d['name'], $this->cfg['size_word']), 'lob', $nw, $enH, $enH * 0.9 / LabelText::PT, 7.0, 2);
            $this->lines($lines, 'lob', $pt, $nx, $cy, $nw, $enH, 'l', $c['ink']);
            if ($enH < $nameH) {
                $dh = $nameH - $enH;
                $dpt = LabelText::fitPt($nameDv, 'dv', $nw, $dh * 0.62 / LabelText::PT, 5.0);
                $this->text($nx, $this->baseCentred($cy + $enH, $dh, 'dv', $dpt), $nw, 'l', 'dv', $dpt, $c['ink'], $nameDv, 0.6);
            }
        }
        $this->p[] = LabelSpots::close();
        $cy += $nameH + $g * 0.75;

        if ($tagline !== '') {
            $this->p[] = LabelSpots::open('heading');
            if ($this->dv) {
                $pt = LabelText::fitPt($tagline, 'dv', $mw, $tagH * 0.75 / LabelText::PT, 4.5);
                $this->text($x, $this->baseCentred($cy, $tagH, 'dv', $pt), $mw, 'r', 'dv', $pt, $c['accent'], $tagline, 0.6);
            } else {
                $t = mb_strtoupper($tagline);
                $ls = 0.14;
                $pt = LabelText::fitPt($t, 'j8', $mw / (1 + $ls * 1.15), $tagH * 0.72 / LabelText::PT, 4.0);
                $this->text($x, $this->baseCentred($cy, $tagH, 'j8', $pt), $mw, 'l', 'j8', $pt, $c['accent'], $t, 0.0, [], $ls);
            }
            $this->p[] = LabelSpots::close();
            $cy += $tagH + $g;
        }

        if ($pillH <= 0) {
            return;
        }
        // The pill: an icon and the words.
        $px = $x;
        if ($pill !== '') {
            $font = $this->dv && $this->cfg['method_text_dv'] !== '' ? 'dv' : 'j8';
            $icon = PouchConfig::METHODS[$this->cfg['method']][2] ?? null;
            $ih = $pillH * 0.56;
            $iw = $icon !== null ? $ih * 1.3 : 0.0;
            $inner = $pillH * 0.42;
            $room = $mw - 2 * $inner - ($icon !== null ? $iw + 1.2 * $u : 0);
            $pt = LabelText::fitPt($pill, $font, $room, $pillH * 0.5 / LabelText::PT, 4.5);
            $tw = LabelText::widthMm($pill, $pt, $font) * 1.02;
            $pw = 2 * $inner + ($icon !== null ? $iw + 1.2 * $u : 0) + $tw;
            $this->p[] = LabelSpots::open('how_to_use');
            $this->box($x, $cy, $pw, $pillH, $c['pill'], $pillH / 2);
            $tx = $x + $inner;
            if ($icon !== null) {
                $this->icon($icon, $tx, $cy + ($pillH - $ih) / 2, $iw, $ih, $c['pill_ink'], $c['pill']);
                $tx += $iw + 1.2 * $u;
            }
            $this->text($tx, $this->baseCentred($cy, $pillH, $font, $pt), $tw + 0.5, 'l', $font, $pt, $c['pill_ink'], $pill, $font === 'dv' ? 0.6 : 0.0);
            $this->p[] = LabelSpots::close();
            $px = $x + $pw + 2.4 * $u;
        }
        // Badges beside the pill (the phone prints once, in the strip: audit, 2026-11-11).
        if ($badges !== [] && $x + $mw - $px > 8.0) {
            $bh = $pillH * 0.7;
            $pills = LabelBadges::pills($badges, $this->dv, round($px, 3), round($cy + ($pillH - $bh) / 2, 3), round($x + $mw - $px, 3), round($bh, 3), 'l');
            if ($pills !== []) {
                $this->p[] = LabelSpots::open('badges');
                array_push($this->p, ...$pills);
                $this->p[] = LabelSpots::close();
            }
        }
    }

    /** "Small Pack": the size word says it is the pack that is small (owner, 2026-11-11), unless it already says what it is. */
    private function packWords(): string
    {
        $word = trim($this->cfg['size_word'] !== '' ? $this->cfg['size_word'] : (string) ($this->d['size_name'] ?? ''));
        if ($word === '') {
            return '';
        }
        $word = mb_convert_case(mb_strtolower($word), MB_CASE_TITLE);

        return preg_match('/\b(pack|box|bag|pouch|tray|tub)\b/i', $word) ? $word : $word . ' Pack';
    }

    /** Where the pack words go: the panel's tag, a round badge on the photo (the panel without one), or a line under the count. */
    private function packPlace(): string
    {
        $place = (string) ($this->cfg['pack_place'] ?? PouchConfig::DEFAULT_PACK_PLACE);
        $hasPhoto = is_string($this->d['photo'] ?? null) && $this->d['photo'] !== '';

        return $place === 'badge' && !$hasPhoto ? 'panel' : $place;
    }

    private function pillWords(): string
    {
        if ($this->cfg['method'] === 'none') {
            return '';
        }
        if ($this->dv && $this->cfg['method_text_dv'] !== '') {
            return $this->cfg['method_text_dv'];
        }

        return $this->cfg['method_text'] !== '' ? $this->cfg['method_text'] : (string) (PouchConfig::METHODS[$this->cfg['method']][0] ?? '');
    }

    /** The pack: its size word, the count and unit (or the net weight), and the price. */
    private function panel(float $x, float $y, float $pw, float $ph): void
    {
        $d = $this->d;
        $c = $this->c;
        $u = $this->u;
        $in = 1.8 * $u;
        $iw = $pw - 2 * $in;
        $pack = $this->packWords();
        $place = $pack === '' ? '' : $this->packPlace();
        $qty = trim((string) ($d['qty'] ?? ''));
        $net = trim((string) ($d['net_weight'] ?? ''));
        $price = trim((string) ($d['price'] ?? ''));
        $unit = ['PCS' => 'PIECES', 'PC' => 'PIECE', 'PACK' => 'PACK'][(string) ($d['unit'] ?? '')] ?? (string) ($d['unit'] ?? '');
        if ($qty === '1' && $unit === 'PIECES') {
            $unit = 'PIECE';
        }
        $big = $qty !== '' ? $qty : $net;
        $under = $qty !== '' ? $unit : '';
        $small = $qty !== '' ? $net : '';

        $rows = [];
        if ($place === 'panel') {
            $rows[] = ['size', $ph * 0.2];
        }
        if ($big !== '') {
            $rows[] = ['big', $ph * ($qty !== '' ? ($place === 'panel' || $place === 'line' ? 0.28 : 0.34) : 0.22)];
        }
        if ($under !== '') {
            $rows[] = ['under', $ph * 0.1];
        }
        if ($place === 'line') {
            $rows[] = ['packline', $ph * 0.15];
        }
        if ($small !== '') {
            $rows[] = ['small', $ph * 0.09];
        }
        if ($price !== '') {
            $rows[] = ['price', $ph * 0.2];
        }
        if (!empty($d['barcode']) && $iw >= 25.0) {
            $rows[] = ['barcode', $ph * 0.3];
        }
        if ($rows === []) {
            return;
        }
        // Too much for the panel: every row gives a little.
        $total = array_sum(array_column($rows, 1));
        if ($total > $ph * 0.9) {
            $rows = array_map(fn (array $r) => [$r[0], $r[1] * $ph * 0.9 / $total], $rows);
        }
        $used = array_sum(array_column($rows, 1));
        $g = min(2.2 * $u, ($ph - $used) / (count($rows) + 1));
        $cy = $y + ($ph - $used - $g * (count($rows) - 1)) / 2;
        foreach ($rows as [$what, $rh]) {
            switch ($what) {
                case 'size':
                    // "Small Pack" in the script face, on a tag of its own: the pack is small, not the momo.
                    $this->box($x + $in, $cy, $iw, $rh, $c['panel_accent'], min(1.6 * $u, $rh * 0.3));
                    $pt = LabelText::fitPt($pack, 'lob', $iw - 2.0 * $u, $rh * 0.7 / LabelText::PT, 4.5);
                    $this->text($x + $in, $this->baseCentred($cy, $rh, 'lob', $pt), $iw, 'c', 'lob', $pt, $c['panel'], $pack);
                    break;
                case 'barcode':
                    $this->p[] = LabelSpots::open('barcode');
                    $this->box($x + $in, $cy, $iw, $rh, '#FFFFFF', 0.6 * $u);
                    $digitsPt = self::clamp(3.4 * $u, 2.8, 4.0);
                    $digitsH = $this->lead('j5', $digitsPt) + 0.3;
                    $bw2 = $iw - 2.4;
                    $bh2 = $rh - $digitsH - 1.0;
                    $this->img($x + $in + 1.2, $cy + 0.6, $bw2, $bh2, (string) $d['barcode']);
                    $this->text($x + $in, $cy + 0.6 + $bh2 + 0.3 + LabelText::ascent('j5') * $digitsPt * LabelText::PT, $iw, 'c', 'j5', $digitsPt, '#000000', (string) ($d['barcode_text'] ?? ''));
                    $this->p[] = LabelSpots::close();
                    break;
                case 'packline':
                    $pt = LabelText::fitPt($pack, 'dsi', $iw, $rh * 0.78 / LabelText::PT, 4.5);
                    $this->text($x + $in, $this->baseCentred($cy, $rh, 'dsi', $pt), $iw, 'c', 'dsi', $pt, $c['panel_accent'], $pack);
                    break;
                case 'big':
                    $this->p[] = LabelSpots::open('qty');
                    $pt = LabelText::fitPt($big, 'j8', $iw, $rh * 1.12 / LabelText::PT, 6.0);
                    $this->text($x + $in, $this->baseCentred($cy, $rh, 'j8', $pt), $iw, 'c', 'j8', $pt, $c['panel_ink'], $big);
                    $this->p[] = LabelSpots::close();
                    break;
                case 'under':
                    $ls = 0.2;
                    $pt = LabelText::fitPt($under, 'j8', $iw / (1 + $ls * 1.2), $rh * 0.72 / LabelText::PT, 3.8);
                    $this->text($x + $in, $this->baseCentred($cy, $rh, 'j8', $pt), $iw + $ls * $pt * LabelText::PT, 'c', 'j8', $pt, $c['panel_ink'], $under, 0.0, [], $ls);
                    break;
                case 'small':
                    $pt = LabelText::fitPt('NET ' . $small, 'j7', $iw, $rh * 0.74 / LabelText::PT, 3.8);
                    $this->text($x + $in, $this->baseCentred($cy, $rh, 'j7', $pt), $iw, 'c', 'j7', $pt, $c['panel_ink'], 'NET ' . $small);
                    break;
                case 'price':
                    $this->p[] = LabelSpots::open('price');
                    $this->box($x + $in, $cy, $iw, $rh, $c['panel_accent'], min(1.8 * $u, $rh * 0.3));
                    $pt = LabelText::fitPt($price, 'j8', $iw - 1.6 * $u, $rh * 0.56 / LabelText::PT, 4.2);
                    $this->text($x + $in, $this->baseCentred($cy, $rh, 'j8', $pt), $iw, 'c', 'j8', $pt, $c['panel'], $price);
                    $this->p[] = LabelSpots::close();
                    break;
            }
            $cy += $rh + $g;
        }
    }

    /** Ingredients, how to use, storage with the dates, the complaints QR, and who made it. */
    private function strip(float $x, float $y, float $sw, float $sh): void
    {
        $d = $this->d;
        $c = $this->c;
        $u = $this->u;
        $in = 2.0 * $u;
        $left = $x + $in;
        $right = $x + $sw - $in;
        $top = $y + 1.5 * $u;
        $bottom = $y + $sh - 1.2 * $u;

        // Who made it: one line along the bottom, always the business; its name is under the logo, so not here again.
        $logo = $c['dark_logo'] ? ($d['wordmark'] ?? $d['logo'] ?? null) : ($d['logo'] ?? null);
        $hasLogo = is_string($logo) && $logo !== '';
        $maker = $this->makerLine(!$hasLogo);
        if ($maker !== '') {
            $mpt = self::clamp(4.3 * $u, 3.8, 5.2);
            $mpt = LabelText::fitPt($maker, 'j5', $right - $left, $mpt, 3.4);
            $this->p[] = LabelSpots::open('footer');
            $this->text($left, $bottom - LabelText::descent('j5') * $mpt * LabelText::PT, $right - $left, $this->a('l'), 'j5', $mpt, $c['strip_ink'], $maker);
            $this->p[] = LabelSpots::close();
            $bottom -= $this->lead('j5', $mpt) + 0.5 * $u;
        }

        // Bake & Grill's logo and name, big, at the head of the strip beside the ingredients (owner, 2026-11-11).
        $ratio = max(0.2, (float) ($c['dark_logo'] && !empty($d['wordmark']) ? ($d['wordmark_ratio'] ?? 1.0) : ($d['logo_ratio'] ?? 1.0)));
        $maker = trim((string) ($d['footer']['name'] ?? ''));
        if ($hasLogo) {
            $bh = $bottom - $top;
            $wide = $ratio >= 2.0;
            $words = $wide || $maker === '' ? [] : [mb_strtoupper($maker)];
            $wordH = $words === [] ? 0.0 : $bh * 0.2;
            $lh = $bh - $wordH - ($words === [] ? 0.0 : 0.4 * $u);
            $lw = min($lh * $ratio, 30.0 * $u);
            $lh = $lw / $ratio;
            $bwid = max($lw, $words === [] ? 0.0 : 17.0 * $u);
            $bx = $this->dv ? $right - $bwid : $left;
            $this->p[] = LabelSpots::open('brand');
            $this->img($bx + ($bwid - $lw) / 2, $top, $lw, $lh, $logo);
            $wy = $top + $lh + 0.4 * $u;
            foreach ($words as $word) {
                $rowH = $wordH / count($words);
                $ls = 0.1;
                $pt = LabelText::fitPt($word, 'j8', $bwid / (1 + $ls * 1.2), $rowH * 0.86 / LabelText::PT, 3.4);
                $this->text($bx, $this->baseCentred($wy, $rowH, 'j8', $pt), $bwid + $ls * $pt * LabelText::PT, 'c', 'j8', $pt, $c['strip_head'], $word, 0.0, [], $ls);
                $wy += $rowH;
            }
            $this->p[] = LabelSpots::close();
            if ($this->dv) {
                $right -= $bwid + 2.8 * $u;
            } else {
                $left += $bwid + 2.8 * $u;
            }
        }

        // The complaints QR on a white plate, with a word beneath.
        $qr = $d['qr'] ?? null;
        if (!empty($d['show_qr']) && is_string($qr) && $qr !== '') {
            $cap = self::clamp(3.9 * $u, 3.5, 4.8);
            $capH = $this->lead('j8', $cap);
            $side = min($bottom - $top - $capH, 15.0 * $u);
            if ($side >= 8.5) {
                $qx = $this->dv ? $left : $right - $side;
                $this->box($qx, $top, $side, $side, '#FFFFFF', 0.6 * $u);
                $q = 0.5 * $u;
                $this->img($qx + $q, $top + $q, $side - 2 * $q, $side - 2 * $q, $qr);
                $word = 'FEEDBACK';
                $cap = LabelText::fitPt($word, 'j8', $side, $cap, 3.2);
                $this->text($qx, $top + $side + 0.2 * $u + LabelText::ascent('j8') * $cap * LabelText::PT, $side, 'c', 'j8', $cap, $c['strip_head'], $word);
                if ($this->dv) {
                    $left += $side + 2.4 * $u;
                } else {
                    $right -= $side + 2.4 * $u;
                }
            }
        }

        // The columns: what each holds as [heading, [text, font, bold, bold words, key]…].
        $dvf = $this->dv;
        $cols = [];
        $ing = trim((string) ($dvf ? ($d['ingredients_dv'] ?: '') : $d['ingredients_en']));
        $ingFont = $dvf ? 'dv' : 'j4';
        if ($dvf && $ing === '') {
            $ing = trim((string) $d['ingredients_en']);
            $ingFont = 'j4';
        }
        $note = trim((string) ($dvf ? $d['note_dv'] : $d['note']));
        if ($ing !== '' || $note !== '') {
            $col = ['key' => 'ingredients', 'head' => $dvf ? 'ހިމެނޭ ތަކެތި' : 'INGREDIENTS', 'blocks' => [], 'weight' => 1.12];
            if ($ing !== '') {
                $col['blocks'][] = [$ing, $ingFont, false, $ingFont === 'j4' ? ($d['allergens'] ?? []) : []];
            }
            if ($this->both && trim((string) $d['ingredients_dv']) !== '') {
                $col['blocks'][] = [trim((string) $d['ingredients_dv']), 'dv', false, []];
            }
            if ($note !== '') {
                $col['blocks'][] = [rtrim($note, '.') . '.', $dvf ? 'dv' : 'j7', true, [], 'note'];
            }
            $nutrition = trim((string) ($d['nutrition']['line'] ?? ''));
            if ($nutrition !== '') {
                $col['blocks'][] = ['Per 100 ' . ($d['nutrition']['per'] ?? 'g') . ': ' . $nutrition, 'j4', false, [], 'nutrition'];
            }
            $cols[] = $col;
        }
        $how = self::howToUse($d, $dvf);
        if ($how !== '') {
            $col = ['key' => 'how_to_use', 'head' => $dvf ? 'ބޭނުންކުރާނެ ގޮތް' : 'HOW TO USE', 'blocks' => [[$how, $dvf ? 'dv' : 'j4', false, []]], 'weight' => 1.0];
            if ($this->both && trim((string) ($d['how_to_use_dv'] ?? '')) !== '') {
                $col['blocks'][] = [trim((string) $d['how_to_use_dv']), 'dv', false, []];
            }
            $cols[] = $col;
        }
        $col = ['key' => 'storage', 'head' => $dvf ? '' : 'STORAGE', 'blocks' => [], 'weight' => 1.0];
        $storage = trim((string) ($dvf ? $d['storage_dv'] : $d['storage_en']));
        if ($storage !== '') {
            $col['blocks'][] = [$storage, $dvf ? 'dv' : 'j4', false, []];
        }
        if ($this->both && trim((string) $d['storage_dv']) !== '') {
            $col['blocks'][] = [trim((string) $d['storage_dv']), 'dv', false, []];
        }
        $within = trim((string) ($dvf ? ($d['use_within_dv'] ?? '') : ($d['use_within'] ?? '')));
        if ($within !== '') {
            $col['blocks'][] = [$within, $dvf ? 'dv' : 'j4', false, []];
        }
        $for = trim(trim((string) ($d['packed_for'] ?? '')) . (trim((string) ($d['packed_for2'] ?? '')) !== '' ? ' · ' . trim((string) $d['packed_for2']) : ''));
        if ($for !== '') {
            $col['blocks'][] = ['Packed for: ' . $for, 'j7', true, [], 'packed', true];
        }
        $blank = '__________';
        $mfgLabel = $dvf ? 'ހެދި ތާރީޚު' : self::title((string) $d['mfg_label']);
        $expLabel = $dvf ? 'ހަމަވާ ތާރީޚު' : self::title((string) $d['exp_label']);
        // The dates always print (the sixth entry): what stands above them is cut to leave them room.
        // In Dhivehi the label and its value are set apart (the seventh entry): a date inside a right-to-left line comes out in pieces.
        $col['blocks'][] = $dvf ? [$mfgLabel, 'dv', true, [], 'dates', true, $d['mfg'] ?: $blank] : [$mfgLabel . ': ' . ($d['mfg'] ?: $blank), 'j7', true, [], 'dates', true];
        $col['blocks'][] = $dvf ? [$expLabel, 'dv', true, [], 'dates', true, $d['exp'] ?: $blank] : [$expLabel . ': ' . ($d['exp'] ?: $blank), 'j7', true, [], 'dates', true];
        $batch = trim((string) ($d['batch'] ?? ''));
        if ($batch !== '' || !empty($d['pack_of'])) {
            $pack = !empty($d['pack_of']) ? 'Pack ' . $d['pack_no'] . '/' . $d['pack_of'] : '';
            $col['blocks'][] = $dvf && $batch !== ''
                ? ['ބެޗް', 'dv', false, [], 'batch', true, $batch . ($pack !== '' ? ' · ' . $pack : '')]
                : [($batch !== '' ? 'Batch: ' . $batch : '') . ($pack !== '' ? ($batch !== '' ? ' · ' : '') . $pack : ''), 'j4', false, [], 'batch', true];
        }
        $cols[] = $col;
        if ($dvf) {
            $cols = array_reverse($cols);
        }

        $gap = 3.0 * $u;
        $room = $right - $left - $gap * (count($cols) - 1);
        $weights = array_sum(array_column($cols, 'weight'));
        // The largest body size at which every column fits whole; at the floor a column is cut with an ellipsis.
        $max = self::clamp(6.2 * $u, 4.6, 8.0);
        $floor = min($max, self::clamp(4.6 * $u, 4.2, 5.5));
        $pt = $floor;
        for ($try = $max; $try >= $floor - 0.01; $try -= 0.2) {
            $ok = true;
            foreach ($cols as $col) {
                if ($this->columnHeight($col, $room * $col['weight'] / $weights, $try) > $bottom - $top + 0.05) {
                    $ok = false;
                    break;
                }
            }
            if ($ok) {
                $pt = $try;
                break;
            }
        }
        $cx = $left;
        foreach ($cols as $col) {
            $cw = $room * $col['weight'] / $weights;
            $this->column($col, $cx, $top, $cw, $bottom, round($pt, 2));
            $cx += $cw + $gap;
        }
    }

    /** @param array<string, mixed> $col */
    private function columnHeight(array $col, float $cw, float $pt): float
    {
        $h = $col['head'] !== '' ? $this->lead($this->dv ? 'dv' : 'j8', $this->headPt($pt)) + 0.5 * $this->u : 0.0;
        foreach ($col['blocks'] as $b) {
            $size = $b[1] === 'dv' ? $pt * 1.22 : $pt;
            $h += count(LabelText::wrap($b[0], $size, $cw, $b[1])) * $this->lead($b[1], $size) + 0.3 * $this->u;
        }

        return $h;
    }

    private function headPt(float $pt): float
    {
        return $this->dv ? $pt * 1.22 : $pt * 0.92;
    }

    /** @param array<string, mixed> $col */
    private function column(array $col, float $x, float $top, float $cw, float $bottom, float $pt): void
    {
        $c = $this->c;
        $cursor = $top;
        $align = $this->a('l');
        $open = null;
        $mark = function (?string $key) use (&$open): void {
            if ($open === $key) {
                return;
            }
            if ($open !== null) {
                $this->p[] = LabelSpots::close();
            }
            if ($key !== null) {
                $this->p[] = LabelSpots::open($key);
            }
            $open = $key;
        };
        $mark($col['key']);
        if ($col['head'] !== '') {
            $font = $this->dv ? 'dv' : 'j8';
            $hp = $this->headPt($pt);
            $this->text($x, $cursor + LabelText::ascent($font) * $hp * LabelText::PT, $cw, $align, $font, $hp, $c['strip_head'], $col['head'], $this->dv ? 0.6 : 0.0, [], $this->dv ? 0.0 : 0.14);
            $cursor += $this->lead($font, $hp) + 0.5 * $this->u;
        }
        // Room kept for the blocks that must print (the dates, the batch, packed for), one line each.
        $kept = 0.0;
        foreach ($col['blocks'] as $b) {
            if (!empty($b[5])) {
                $kept += $this->lead($b[1], $b[1] === 'dv' ? $pt * 1.22 : $pt) + 0.3 * $this->u;
            }
        }
        foreach ($col['blocks'] as $b) {
            [$text, $font, $bold, $words] = $b;
            $size = $font === 'dv' ? $pt * 1.22 : $pt;
            $lead = $this->lead($font, $size);
            $must = !empty($b[5]);
            if ($must) {
                $kept -= $lead + 0.3 * $this->u;
            }
            $lines = LabelText::wrap($text, $size, $cw, $font);
            $fit = (int) floor(($bottom - $cursor - ($must ? max(0.0, $kept) : $kept) + 0.05) / $lead);
            if ($fit < 1) {
                if ($must) {
                    $fit = 1;
                } else {
                    continue;
                }
            }
            $mark($b[4] ?? $col['key']);
            if (count($lines) > $fit) {
                $lines = array_slice($lines, 0, $fit);
                $last = rtrim((string) array_pop($lines), ' ,،.');
                while ($last !== '' && LabelText::widthMm($last . '…', $size, $font) > $cw) {
                    $last = rtrim(mb_substr($last, 0, -1), ' ,،.');
                }
                $lines[] = $last . '…';
            }
            if (isset($b[6])) {
                // A Dhivehi label at the right, its value in Latin figures at the left of the same line.
                $base = $cursor + LabelText::ascent($font) * $size * LabelText::PT;
                $this->text($x, $base, $cw, 'r', $font, $size, $bold ? $c['strip_head'] : $c['strip_ink'], $lines[0], $bold ? 0.6 : 0.35);
                $this->text($x, $base, $cw, 'l', 'j7', $pt, $bold ? $c['strip_head'] : $c['strip_ink'], (string) $b[6]);
                $cursor += $lead + 0.3 * $this->u;

                continue;
            }
            foreach ($lines as $i => $l) {
                $this->text($x, $cursor + $i * $lead + LabelText::ascent($font) * $size * LabelText::PT, $cw, $font === 'dv' ? 'r' : ($this->dv ? 'r' : 'l'), $font, $size, $bold ? $c['strip_head'] : $c['strip_ink'], $l, $font === 'dv' ? ($bold ? 0.6 : 0.35) : 0.0, $words);
            }
            $cursor += count($lines) * $lead + 0.3 * $this->u;
        }
        $mark(null);
    }

    /** "Made by Bake & Grill · Kalaafaanu Hingun, Malé · 912 0011 · bakeandgrill.mv": the footer's lines, always the business's. */
    private function makerLine(bool $withName = true): string
    {
        $f = $this->d['footer'] ?? [];
        $name = trim((string) ($f['name'] ?? ''));
        if ($name === '') {
            return '';
        }
        $parts = $withName ? ['Made by ' . $name] : [];
        foreach (['address', 'phone', 'website'] as $k) {
            $v = trim((string) ($f[$k] ?? ''));
            if ($v !== '') {
                $parts[] = $k === 'phone' ? 'Tel ' . $v : $v;
            }
        }

        return implode('  ·  ', $parts);
    }

    /**
     * A cooking icon from filled boxes, so the browser, the PDF and the
     * label printer draw the same thing: an outline is the shape in ink with
     * a smaller one in the ground colour over it.
     */
    private function icon(string $icon, float $x, float $y, float $w, float $h, string $ink, string $ground): void
    {
        $t = max(0.28, $h * 0.13);
        $hollow = function (float $bx, float $by, float $bw, float $bh, float $r) use ($ink, $ground, $t): void {
            $this->box($bx, $by, $bw, $bh, $ink, $r);
            $this->box($bx + $t, $by + $t, $bw - 2 * $t, $bh - 2 * $t, $ground, max(0.0, $r - $t));
        };
        $steam = function (float $sx, float $sy, float $sw, float $sh) use ($ink, $t): void {
            for ($i = 0; $i < 3; $i++) {
                $this->box($sx + $sw * (0.2 + 0.3 * $i) - $t / 2, $sy + ($i === 1 ? 0 : $sh * 0.25), $t, $sh * ($i === 1 ? 1.0 : 0.75), $ink, $t / 2);
            }
        };
        switch ($icon) {
            case 'microwave':
                $hollow($x, $y, $w, $h, $h * 0.18);
                $hollow($x + $t * 1.9, $y + $t * 1.9, $w * 0.56, $h - $t * 3.8, $h * 0.08);
                $this->box($x + $w - $t * 2.7, $y + $h * 0.3, $t, $t, $ink, $t / 2);
                $this->box($x + $w - $t * 2.7, $y + $h * 0.6, $t, $t, $ink, $t / 2);
                break;
            case 'steam':
            case 'pot':
                $steam($x + $w * 0.15, $y, $w * 0.7, $h * 0.36);
                $this->box($x, $y + $h * 0.44, $w, $t, $ink, $t / 2);
                $this->box($x + $w * 0.1, $y + $h * 0.44 + $t * 1.6, $w * 0.8, $h * 0.56 - $t * 1.6, $ink, $h * 0.16);
                if ($icon === 'steam') {
                    $this->box($x + $w * 0.1 + $t, $y + $h * 0.44 + $t * 2.4, $w * 0.8 - 2 * $t, $t, $ground, $t / 2);
                }
                break;
            case 'pan':
                $pd = min($h, $w * 0.68);
                $this->box($x, $y + ($h - $pd) / 2, $pd, $pd, $ink, $pd / 2);
                $this->box($x + $t, $y + ($h - $pd) / 2 + $t, $pd - 2 * $t, $pd - 2 * $t, $ground, ($pd - 2 * $t) / 2);
                $this->box($x + $pd - $t / 2, $y + $h / 2 - $t * 0.6, $w - $pd + $t / 2, $t * 1.2, $ink, $t * 0.6);
                break;
            case 'fryer':
                $this->box($x + $w * 0.42, $y, $t, $h * 0.4, $ink, $t / 2);
                $this->box($x + $w * 0.42, $y, $w * 0.5, $t, $ink, $t / 2);
                $hollow($x, $y + $h * 0.34, $w * 0.84, $h * 0.66, $h * 0.14);
                $this->box($x + $t * 1.8, $y + $h * 0.6, $w * 0.84 - $t * 3.6, $t, $ink, $t / 2);
                break;
            case 'airfryer':
                $hollow($x + $w * 0.12, $y, $w * 0.76, $h, $h * 0.26);
                $this->box($x + $w * 0.3, $y + $h * 0.2, $w * 0.4, $t, $ink, $t / 2);
                $hollow($x + $w * 0.26, $y + $h * 0.46, $w * 0.48, $h * 0.38, $h * 0.08);
                break;
            case 'oven':
                $hollow($x, $y, $w, $h, $h * 0.12);
                $this->box($x + $t * 2, $y + $t * 1.8, $t, $t, $ink, $t / 2);
                $this->box($x + $t * 4, $y + $t * 1.8, $t, $t, $ink, $t / 2);
                $hollow($x + $t * 1.8, $y + $h * 0.42, $w - $t * 3.6, $h * 0.58 - $t * 1.8, $h * 0.06);
                break;
        }
    }

    /**
     * A picture cut to a circle: the middle square of it, the corners clear.
     * Cached, as the pictures themselves are.
     */
    public static function circle(string $uri): string
    {
        if (!preg_match('#^data:image/(png|jpeg|jpg|gif);base64,#', $uri, $m) || !function_exists('imagecreatefromstring')) {
            return $uri;
        }
        $make = function () use ($uri, $m): string {
            $src = @imagecreatefromstring((string) base64_decode(substr($uri, strlen($m[0])), true));
            if ($src === false) {
                return $uri;
            }
            $sw = imagesx($src);
            $sh = imagesy($src);
            // A cut-out (clear corners: a plate lifted off its photo) is fitted whole on white; a photo is cut to its middle square.
            $cutout = (((int) imagecolorat($src, 0, 0)) >> 24 & 0x7F) > 100 && (((int) imagecolorat($src, $sw - 1, $sh - 1)) >> 24 & 0x7F) > 100;
            $side = $cutout ? max($sw, $sh) : min($sw, $sh);
            $px = min(520, $side);
            $out = imagecreatetruecolor($px, $px);
            imagealphablending($out, false);
            imagesavealpha($out, true);
            // A cut-out's clear parts show the plate behind it, white.
            imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
            imagealphablending($out, true);
            if ($cutout) {
                $k = $px * 0.97 / $side;
                imagecopyresampled($out, $src, (int) round(($px - $sw * $k) / 2), (int) round(($px - $sh * $k) / 2), 0, 0, (int) round($sw * $k), (int) round($sh * $k), $sw, $sh);
            } else {
                imagecopyresampled($out, $src, 0, 0, (int) (($sw - $side) / 2), (int) (($sh - $side) / 2), $px, $px, $side, $side);
            }
            imagealphablending($out, false);
            $clear = imagecolorallocatealpha($out, 255, 255, 255, 127);
            $r = $px / 2;
            for ($y = 0; $y < $px; $y++) {
                $dy = $y + 0.5 - $r;
                $half = (int) floor(sqrt(max(0.0, $r * $r - $dy * $dy)));
                $x0 = (int) round($r) - $half;
                $x1 = (int) round($r) + $half;
                if ($x0 > 0) {
                    imageline($out, 0, $y, $x0 - 1, $y, $clear);
                }
                if ($x1 < $px) {
                    imageline($out, $x1, $y, $px - 1, $y, $clear);
                }
            }
            ob_start();
            imagepng($out, null, 6);
            $png = (string) ob_get_clean();
            imagedestroy($src);
            imagedestroy($out);

            return 'data:image/png;base64,' . base64_encode($png);
        };
        try {
            return (string) Cache::remember('label-circle2:' . md5($uri), 86400, $make);
        } catch (\Throwable) {
            return $make();
        }
    }

    // ---- Helpers (as WrapDesign's) ----

    /** "MFG DATE" as "Mfg date": the strip is set in sentence case. */
    private static function title(string $label): string
    {
        $label = trim($label);

        return $label === mb_strtoupper($label) ? mb_strtoupper(mb_substr($label, 0, 1)) . mb_strtolower(mb_substr($label, 1)) : $label;
    }

    private function a(string $align): string
    {
        return $this->dv ? ['l' => 'r', 'r' => 'l', 'c' => 'c'][$align] : $align;
    }

    /**
     * @param list<string> $lines
     */
    private function lines(array $lines, string $font, float $pt, float $x, float $y, float $w, float $h, string $align, string $colour, float $bold = 0.0): void
    {
        $lead = $this->lead($font, $pt) * (count($lines) > 1 ? 0.86 : 1.0);
        $block = $lead * count($lines);
        $top = $y + ($h - $block) / 2;
        foreach ($lines as $i => $l) {
            $this->text($x, $this->baseCentred($top + $i * $lead, $lead, $font, $pt), $w, $align, $font, $pt, $colour, $l, $bold);
        }
    }

    /** @return array{0: float, 1: list<string>} */
    private function fitLines(string $text, string $font, float $w, float $h, float $maxPt, float $minPt, int $maxLines): array
    {
        $lineK = $this->lead($font, 1.0);
        $pt = LabelText::fitPt($text, $font, $w, min($maxPt, $h / $lineK), $minPt);
        $oneLine = LabelText::widthMm($text, $pt, $font) <= $w * 1.01;
        // Two lines only when they come out clearly larger than one.
        $two = null;
        if ($maxLines > 1 && str_contains(trim($text), ' ')) {
            for ($try = min($maxPt, $h / ($maxLines * $lineK * 0.86)); $try >= $minPt - 0.01; $try -= 0.25) {
                $lines = LabelText::wrap($text, $try, $w, $font);
                if (count($lines) <= $maxLines) {
                    $two = [round($try, 2), $lines];
                    break;
                }
            }
        }
        if ($oneLine && ($two === null || $two[0] < $pt * 1.25)) {
            return [$pt, [$text]];
        }

        return $two ?? [$minPt, array_slice(LabelText::wrap($text, $minPt, $w, $font), 0, $maxLines)];
    }

    private function lead(string $font, float $pt): float
    {
        return (LabelText::ascent($font) + LabelText::descent($font)) * $pt * LabelText::PT * ($font === 'dv' ? 1.08 : 1.04);
    }

    private function baseCentred(float $top, float $h, string $font, float $pt): float
    {
        $asc = LabelText::ascent($font) * $pt * LabelText::PT;
        $desc = LabelText::descent($font) * $pt * LabelText::PT;

        return $top + ($h - ($asc + $desc)) / 2 + $asc;
    }

    /** @param list<string> $boldWords */
    private function text(float $x, float $base, float $w, string $align, string $font, float $pt, string $color, string $text, float $bold = 0.0, array $boldWords = [], float $ls = 0.0): void
    {
        if (trim($text) === '') {
            return;
        }
        $piece = ['t' => 'text', 'x' => round($x, 3), 'base' => round($base, 3), 'w' => round($w, 3), 'align' => $align, 'font' => $font, 'pt' => round($pt, 2), 'color' => $color, 'text' => $text];
        if ($bold > 0) {
            $piece['bold'] = $bold;
        }
        if ($boldWords !== []) {
            $piece['bold_words'] = $boldWords;
        }
        if ($ls > 0) {
            $piece['ls'] = $ls;
        }
        $this->p[] = $piece;
    }

    private function box(float $x, float $y, float $w, float $h, string $fill, float $r = 0.0): void
    {
        if ($w <= 0 || $h <= 0) {
            return;
        }
        $this->p[] = ['t' => 'rect', 'x' => round($x, 3), 'y' => round($y, 3), 'w' => round($w, 3), 'h' => round($h, 3), 'fill' => $fill, 'r' => round($r, 3)];
    }

    private function img(float $x, float $y, float $w, float $h, string $src): void
    {
        $this->p[] = ['t' => 'img', 'x' => round($x, 3), 'y' => round($y, 3), 'w' => round($w, 3), 'h' => round($h, 3), 'src' => $src];
    }

    private static function clamp(float $v, float $min, float $max): float
    {
        return max($min, min($max, $v));
    }
}
