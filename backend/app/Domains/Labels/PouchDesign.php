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

    /** @var array{look: string, method: string, method_text: string, method_text_dv: string, tagline: string, tagline_dv: string, size_word: string} */
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
        $panelW = self::clamp($w * 0.2, 19.0, 36.0);
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
        $tagline = $this->dv ? ($this->cfg['tagline_dv'] !== '' ? $this->cfg['tagline_dv'] : (string) ($d['header_line_dv'] ?? ''))
            : ($this->cfg['tagline'] !== '' ? $this->cfg['tagline'] : (string) ($d['header_line'] ?? ''));
        $pill = $this->pillWords();
        $phone = trim((string) ($d['footer']['phone'] ?? ''));
        // Rows left out give their room to the name.
        if ($tagline === '') {
            $nameH += $tagH;
            $tagH = 0.0;
        }
        if ($pill === '' && $phone === '') {
            $nameH += $pillH;
            $pillH = 0.0;
        }
        $free = $mh - $logoH - $nameH - $tagH - $pillH;
        $g = $free / 5;
        $cy = $y + $g * 1.25;

        // The brand's logo on a plate that keeps it readable on any look.
        $logo = $c['dark_logo'] && !empty($d['brand']['is_default']) ? ($d['wordmark'] ?? null) : ($d['brand']['logo'] ?? $d['logo'] ?? null);
        $ratio = $c['dark_logo'] && !empty($d['brand']['is_default']) ? (float) ($d['wordmark_ratio'] ?? 1.0) : (float) ($d['brand']['logo_ratio'] ?? $d['logo_ratio'] ?? 1.0);
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

        // The name: hand-lettered when the label has a title picture, else the script face.
        $this->p[] = LabelSpots::open('name');
        $title = $d['title_img'] ?? null;
        $nameDv = trim((string) ($d['name_dv'] ?? ''));
        if (is_string($title) && $title !== '' && !$this->dv) {
            $tr = max(0.1, (float) ($d['title_ratio'] ?? 1.0));
            $tw = min($mw, $nameH * $tr);
            $this->img($x, $cy + ($nameH - $tw / $tr) / 2, $tw, $tw / $tr, $title);
        } elseif ($this->dv && $nameDv !== '') {
            [$pt, $lines] = $this->fitLines($nameDv, 'dv', $mw, $nameH, $nameH * 0.8 / LabelText::PT, 7.0, 2);
            $this->lines($lines, 'dv', $pt, $x, $cy, $mw, $nameH, 'r', $c['ink'], 0.7);
        } else {
            $enH = $this->both && $nameDv !== '' ? $nameH * 0.64 : $nameH;
            [$pt, $lines] = $this->fitLines((string) $d['name'], 'lob', $mw, $enH, $enH * 0.9 / LabelText::PT, 7.0, 2);
            $this->lines($lines, 'lob', $pt, $x, $cy, $mw, $enH, 'l', $c['ink']);
            if ($enH < $nameH) {
                $dh = $nameH - $enH;
                $dpt = LabelText::fitPt($nameDv, 'dv', $mw, $dh * 0.62 / LabelText::PT, 5.0);
                $this->text($x, $this->baseCentred($cy + $enH, $dh, 'dv', $dpt), $mw, 'l', 'dv', $dpt, $c['ink'], $nameDv, 0.6);
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
        // The pill: an icon and the words; the phone beside it when both fit.
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
        if ($phone !== '') {
            $words = 'Call ' . $phone;
            $pt = $pillH * 0.44 / LabelText::PT;
            $room = $x + $mw - $px;
            if (LabelText::widthMm($words, $pt, 'j8') > $room) {
                $words = $phone;
            }
            if (LabelText::widthMm($words, $pt, 'j8') <= $room) {
                $this->p[] = LabelSpots::open('footer');
                $this->text($px, $this->baseCentred($cy, $pillH, 'j8', $pt), $room, 'l', 'j8', $pt, $c['ink'], $words);
                $this->p[] = LabelSpots::close();
            }
        }
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
        $size = mb_strtoupper($this->cfg['size_word'] !== '' ? $this->cfg['size_word'] : (string) ($d['size_name'] ?? ''));
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
        if ($size !== '') {
            $rows[] = ['size', $ph * 0.13];
        }
        if ($big !== '') {
            $rows[] = ['big', $ph * ($qty !== '' ? 0.34 : 0.22)];
        }
        if ($under !== '') {
            $rows[] = ['under', $ph * 0.1];
        }
        if ($small !== '') {
            $rows[] = ['small', $ph * 0.09];
        }
        if ($price !== '') {
            $rows[] = ['price', $ph * 0.2];
        }
        if ($rows === []) {
            return;
        }
        $used = array_sum(array_column($rows, 1));
        $g = min(2.2 * $u, ($ph - $used) / (count($rows) + 1));
        $cy = $y + ($ph - $used - $g * (count($rows) - 1)) / 2;
        foreach ($rows as [$what, $rh]) {
            switch ($what) {
                case 'size':
                    $ls = 0.18;
                    $pt = LabelText::fitPt($size, 'j8', $iw / (1 + $ls * 1.2), $rh * 0.72 / LabelText::PT, 4.0);
                    $this->text($x + $in, $this->baseCentred($cy, $rh, 'j8', $pt), $iw + $ls * $pt * LabelText::PT, 'c', 'j8', $pt, $c['panel_accent'], $size, 0.0, [], $ls);
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

        // Who made it: one line along the bottom, always the business.
        $maker = $this->makerLine();
        if ($maker !== '') {
            $mpt = self::clamp(4.3 * $u, 3.8, 5.2);
            $mpt = LabelText::fitPt($maker, 'j5', $right - $left, $mpt, 3.4);
            $this->p[] = LabelSpots::open('footer');
            $this->text($left, $bottom - LabelText::descent('j5') * $mpt * LabelText::PT, $right - $left, $this->a('l'), 'j5', $mpt, $c['strip_ink'], $maker);
            $this->p[] = LabelSpots::close();
            $bottom -= $this->lead('j5', $mpt) + 0.5 * $u;
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
                $col['blocks'][] = [rtrim($note, '.') . '.', $dvf ? 'dv' : 'j7', true, []];
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
        $blank = '__________';
        $mfgLabel = $dvf ? 'ހެދި ތާރީޚު' : self::title((string) $d['mfg_label']);
        $expLabel = $dvf ? 'ހަމަވާ ތާރީޚު' : self::title((string) $d['exp_label']);
        $col['blocks'][] = [$mfgLabel . ': ' . ($d['mfg'] ?: $blank), $dvf ? 'dv' : 'j7', true, [], 'dates'];
        $col['blocks'][] = [$expLabel . ': ' . ($d['exp'] ?: $blank), $dvf ? 'dv' : 'j7', true, [], 'dates'];
        $batch = trim((string) ($d['batch'] ?? ''));
        if ($batch !== '' || !empty($d['pack_of'])) {
            $line = ($batch !== '' ? ($dvf ? 'ބެޗް: ' : 'Batch: ') . $batch : '') . (!empty($d['pack_of']) ? ($batch !== '' ? ' · ' : '') . 'Pack ' . $d['pack_no'] . '/' . $d['pack_of'] : '');
            $col['blocks'][] = [$line, $dvf ? 'dv' : 'j4', false, [], 'batch'];
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
        foreach ($col['blocks'] as $b) {
            [$text, $font, $bold, $words] = $b;
            $mark($b[4] ?? $col['key']);
            $size = $font === 'dv' ? $pt * 1.22 : $pt;
            $lead = $this->lead($font, $size);
            $lines = LabelText::wrap($text, $size, $cw, $font);
            $fit = (int) floor(($bottom - $cursor + 0.05) / $lead);
            if ($fit < 1) {
                break;
            }
            if (count($lines) > $fit) {
                $lines = array_slice($lines, 0, $fit);
                $last = rtrim((string) array_pop($lines), ' ,،.');
                while ($last !== '' && LabelText::widthMm($last . '…', $size, $font) > $cw) {
                    $last = rtrim(mb_substr($last, 0, -1), ' ,،.');
                }
                $lines[] = $last . '…';
            }
            foreach ($lines as $i => $l) {
                $this->text($x, $cursor + $i * $lead + LabelText::ascent($font) * $size * LabelText::PT, $cw, $font === 'dv' ? 'r' : ($this->dv ? 'r' : 'l'), $font, $size, $bold ? $c['strip_head'] : $c['strip_ink'], $l, $font === 'dv' ? ($bold ? 0.6 : 0.35) : 0.0, $words);
            }
            $cursor += count($lines) * $lead + 0.3 * $this->u;
        }
        $mark(null);
    }

    /** "Made by Bake & Grill · Kalaafaanu Hingun, Malé · 912 0011 · bakeandgrill.mv": the footer's lines, always the business's. */
    private function makerLine(): string
    {
        $f = $this->d['footer'] ?? [];
        $name = trim((string) ($f['name'] ?? ''));
        if ($name === '') {
            return '';
        }
        $parts = ['Made by ' . $name];
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
            $side = min($sw, $sh);
            $px = min(520, $side);
            $out = imagecreatetruecolor($px, $px);
            imagealphablending($out, false);
            imagesavealpha($out, true);
            // A cut-out's clear parts show the plate behind it, white.
            imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
            imagealphablending($out, true);
            imagecopyresampled($out, $src, 0, 0, (int) (($sw - $side) / 2), (int) (($sh - $side) / 2), $px, $px, $side, $side);
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
            return (string) Cache::remember('label-circle:' . md5($uri), 86400, $make);
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
