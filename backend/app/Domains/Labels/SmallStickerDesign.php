<?php

declare(strict_types=1);

namespace App\Domains\Labels;

/**
 * The small sticker, for labels too small for the compact one, down to
 * 30 × 20 mm and 30 mm circles (owner, 2026-10-11: "Add label size. For example
 * rectangular 4 cm by 6 cm, circle 6 cm diameter"). Pieces in millimetres from
 * the label's top-left corner, in StickerDesign's piece format.
 *
 * It always says who the label is from (logo, brand line, the type's heading),
 * what it is, when it was made and when it expires, and how to keep it. The
 * rest goes in while there is room, in this order: the footer with the phone,
 * the ingredients, the note, the complaints QR, the batch line, the use-within
 * line, the picture. An upright label stacks everything; a wide one (width at
 * least 1.2 × height) puts the dates in a column beside the name; a label under
 * 24 mm tall trades the header band for a tinted line. Nothing is set below
 * about 3pt, and a list that does not fit ends in "…" rather than vanishing.
 */
final class SmallStickerDesign
{
    /** @var list<array<string, mixed>> */
    private array $p = [];

    /** @param array<string, mixed> $d see StickerSheet::stickerData() */
    private function __construct(private readonly array $d, private readonly bool $dv, private readonly float $w) {}

    /**
     * @param array<string, mixed> $d
     * @return list<array<string, mixed>>
     */
    public static function rect(array $d, bool $dv, float $w, float $h): array
    {
        $s = new self($d, $dv, $w);
        if ($h < 24) {
            $s->tiny($h);
        } elseif ($w >= 1.2 * $h) {
            $s->wide($h);
        } else {
            $s->upright($h);
        }

        return $s->p;
    }

    /**
     * A round sticker under 45 mm: the round design's rows without the
     * ingredients, so the name and dates stay big enough to read.
     *
     * @param array<string, mixed> $d
     * @return list<array<string, mixed>>
     */
    public static function round(array $d, bool $dv, float $D): array
    {
        $s = new self($d, $dv, $D);
        $s->circle($D);

        return $s->p;
    }

    // ---- Arrangements ----

    /** Upright or square: header, name, the middle (ingredients, QR, picture), dates, strip, footer. */
    private function upright(float $h): void
    {
        $w = $this->w;
        $short = min($w, $h);
        $k = $this->k($short);
        $pad = $this->pad($k);
        $gap = $this->gap($k);
        $iw = $w - 2 * $pad;
        $ih = $h - 2 * $pad;

        $hb = self::clamp($short * 0.22, 5.4, 12.0);
        $nh = self::clamp($short * 0.16, 4.2, 8.0);
        $bh = self::clamp($short * 0.19, 5.0, 9.0);
        $sh = $this->stripHeight($iw, self::clamp($short * 0.08, 2.6, 4.2));
        $fh = self::clamp($short * 0.13, 3.8, 6.0);
        $line = self::clamp(2.4 * $k, 2.2, 3.2);
        $side = $iw >= 30;
        $datesH = $side ? $bh : 2 * $bh + 0.6 * $gap;

        // The essentials, then the extras while they fit.
        $free = $ih - ($hb + $gap + $nh + $gap + $datesH + $gap + $sh);
        $footer = $this->take($free, $fh + $gap) ? 'band' : ($this->take($free, $line + 0.5 * $gap) ? 'line' : 'none');
        $ing = $this->ingredientsText();
        $hasIng = $ing !== '' && $this->take($free, $this->ingredientsMin($k) + $gap);
        $note = $this->noteText() !== '' && $this->take($free, $line);
        $batch = $this->take($free, $line + 0.3 * $gap);
        $within = $this->withinText() !== '' && $this->take($free, $line);

        $y = $pad;
        $this->header($pad, $y, $iw, $hb, 0.0, $k);
        $y += $hb + $gap;
        $this->name($pad, $y, $iw, $nh, 'c', $k);
        $y += $nh + $gap;

        // From the bottom up.
        $bottom = $h - $pad;
        if ($footer === 'band') {
            $this->footerBand($pad, $bottom - $fh, $iw, $fh, $k);
            $bottom -= $fh + $gap;
        } elseif ($footer === 'line') {
            $this->footerLine($pad, $bottom - $line, $iw, $line, $k);
            $bottom -= $line + 0.5 * $gap;
        }
        $this->strip($pad, $bottom - $sh, $iw, $sh, $k);
        $bottom -= $sh + $gap;
        if ($batch) {
            $this->batchLine($pad, $bottom - $line, $iw, $line, $k);
            $bottom -= $line + 0.3 * $gap;
        }
        if ($within) {
            $this->withinLine($pad, $bottom - $line, $iw, $line, $k);
            $bottom -= $line;
        }
        $this->dates($pad, $bottom - $datesH, $iw, $datesH, $bh, $side, $k);
        $bottom -= $datesH + $gap;

        // The middle, centred between the name and the dates: the ingredients
        // and the note with the QR beside them, or else the picture and the QR
        // side by side.
        $mid = $bottom - $y;
        $qr = $this->qrFits() && $mid >= 9.0 && $iw >= 34 ? min(11.0, $mid, $iw * 0.3) : 0.0;
        $textW = $iw - ($qr > 0 ? $qr + 1.4 : 0.0);
        $plan = $hasIng ? $this->planIngredients($textW, $mid - ($note ? $line : 0.0), $k) : null;
        $textH = ($plan['height'] ?? 0.0) + ($note ? $line : 0.0);
        if ($textH > 0) {
            $block = max($textH, $qr);
            $top = $y + max(0.0, ($mid - $block) / 2);
            $align = $qr > 0 ? 'l' : 'c';
            $ty = $top + ($block - $textH) / 2;
            if ($plan !== null) {
                $this->drawIngredients($plan, $pad, $ty, $textW, $align);
                $ty += $plan['height'];
            }
            if ($note) {
                $this->noteLine($pad, $ty, $textW, $line, $k, $align);
            }
            if ($qr > 0) {
                $this->qr($pad + $iw - $qr, $top + ($block - $qr) / 2, $qr);
            }
        } else {
            $this->pictureAndQr($pad, $y, $iw, $mid, $qr);
        }
    }

    /** Wide: header with the QR at its end, name and ingredients on the left, the dates on the right, strip and footer under. */
    private function wide(float $h): void
    {
        $w = $this->w;
        $short = $h;
        $k = $this->k($short);
        $pad = $this->pad($k);
        $gap = $this->gap($k);
        $iw = $w - 2 * $pad;
        $ih = $h - 2 * $pad;

        $hb = self::clamp($short * 0.22, 5.4, 12.0);
        $qr = $this->qrFits() && $hb - 1.4 >= 8.0 && $iw >= 56 ? $hb - 1.4 : 0.0;
        $bh = self::clamp($short * 0.19, 5.0, 9.0);
        $sh = $this->stripHeight($iw, self::clamp($short * 0.08, 2.6, 4.2));
        $fh = self::clamp($short * 0.12, 3.8, 6.0);
        $line = self::clamp(2.4 * $k, 2.2, 3.2);
        $rw = self::clamp($iw * 0.4, 15.0, 36.0);
        $lw = $iw - $rw - 1.4 * $gap;

        $free = $ih - ($hb + $gap + 2 * $bh + 0.6 * $gap + $gap + $sh);
        $footer = $this->take($free, $fh + $gap) ? 'band' : ($this->take($free, $line + 0.5 * $gap) ? 'line' : 'none');
        $batch = $this->take($free, $line);

        $y = $pad;
        $this->header($pad, $y, $iw, $hb, $qr, $k);
        $y += $hb + $gap;

        $bottom = $h - $pad;
        if ($footer === 'band') {
            $this->footerBand($pad, $bottom - $fh, $iw, $fh, $k);
            $bottom -= $fh + $gap;
        } elseif ($footer === 'line') {
            $this->footerLine($pad, $bottom - $line, $iw, $line, $k);
            $bottom -= $line + 0.5 * $gap;
        }
        $this->strip($pad, $bottom - $sh, $iw, $sh, $k);
        $bottom -= $sh + $gap;
        if ($batch) {
            $this->batchLine($pad, $bottom - $line, $iw, $line, $k);
            $bottom -= $line + 0.3 * $gap;
        }

        // The dates' column: two boxes (or two lines when it is too short), the use-within line under them.
        $mid = $bottom - $y;
        $within = $this->withinText() !== '' && $mid - (2 * $bh + 0.6 * $gap) >= $line;
        $boxes = $mid - ($within ? $line : 0.0);
        $bhFit = min($bh, ($boxes - 0.6 * $gap) / 2);
        $rx = $pad + $iw - $rw;
        if ($bhFit >= 4.6) {
            $datesH = 2 * $bhFit + 0.6 * $gap;
            $top = $y + max(0.0, ($boxes - $datesH) / 2);
            $this->dates($rx, $top, $rw, $datesH, $bhFit, false, $k);
            if ($within) {
                $this->withinLine($rx, $top + $datesH, $rw, $line, $k);
            }
        } else {
            $this->dateLines($rx, $y, $rw, $mid, $k);
        }

        // The left column: name, then ingredients and note, then a picture in what is left.
        $nh = self::clamp($mid * 0.4, 4.2, 8.5);
        $this->name($pad, $y, $lw, $nh, 'l', $k);
        $left = $mid - $nh - 0.4 * $gap;
        $ly = $y + $nh + 0.4 * $gap;
        $used = 0.0;
        $note = $this->noteText() !== '' && $left >= $line;
        if ($this->ingredientsText() !== '' && $left - ($note ? $line : 0.0) >= $this->ingredientsMin($k)) {
            $used = $this->ingredients($pad, $ly, $lw, $left - ($note ? $line : 0.0), $k, 'l');
        }
        if ($note) {
            $this->noteLine($pad, $ly + $used, $lw, $line, $k, 'l');
            $used += $line;
        }
        if ($left - $used >= 8.0) {
            $this->picture($pad, $ly + $used, $lw, $left - $used, 'l');
        }
    }

    /** Under 24 mm tall: a tinted brand line, logo and name, the two dates, the storage strip. */
    private function tiny(float $h): void
    {
        $w = $this->w;
        $k = $this->k(min($w, $h));
        $pad = $this->pad($k);
        $gap = $this->gap($k);
        $iw = $w - 2 * $pad;
        $d = $this->d;
        $brand = $d['brand'];

        // Brand line in a tinted band: "BAKE & GRILL · FROZEN HEDHIKA".
        $tb = self::clamp($h * 0.17, 3.0, 4.0);
        $this->box($pad, $pad, $iw, $tb, StickerDesign::TINT, 0.8);
        if ($this->dv) {
            $t = trim($brand['name_dv'] . '  •  ' . $d['header_line_dv'], ' •');
            $pt = LabelText::fitPt($t, 'dv', $iw - 1.6, $tb * 1.55, 3.4);
            $this->text($pad + 0.8, $this->baseCentred($pad, $tb, 'dv', $pt), $iw - 1.6, 'r', 'dv', $pt, StickerDesign::DARK, $t, 0.5);
        } else {
            $t = mb_strtoupper($brand['name']) . '  ·  ' . $d['header_line'];
            $pt = LabelText::fitPt($t, 'j7', $iw - 1.6, $tb * 1.45, 3.0);
            $this->text($pad + 0.8, $this->baseCentred($pad, $tb, 'j7', $pt), $iw - 1.6, 'c', 'j7', $pt, StickerDesign::DARK, $t);
        }

        $sh = $this->stripHeight($iw, self::clamp($h * 0.12, 2.4, 3.0));
        $this->strip($pad, $h - $pad - $sh, $iw, $sh, $k);

        $y = $pad + $tb + 0.6 * $gap;
        $mid = $h - $pad - $sh - 0.6 * $gap - $y;
        $rw = self::clamp($iw * 0.48, 13.0, 30.0);
        $lw = $iw - $rw - $gap;
        // Logo and name on the left, the dates on the right.
        $logo = $brand['logo'] ?: $d['mark'];
        $lgW = 0.0;
        if ($logo) {
            [$lgW, $lgH] = StickerDesign::fit($brand['logo'] ? $brand['logo_ratio'] : $d['mark_ratio'], $mid * 0.75, $mid);
            if ($lgW <= $lw * 0.4) {
                $this->img($this->X($pad, $lgW), $y + ($mid - $lgH) / 2, $lgW, $lgH, $logo);
            } else {
                $lgW = 0.0;
            }
        }
        $nx = $pad + ($lgW > 0 ? $lgW + 0.8 : 0.0);
        $this->name($nx, $y, $lw - ($nx - $pad), $mid, 'l', $k);
        $this->dateLines($pad + $iw - $rw, $y, $rw, $mid, $k);
    }

    /** A circle under 45 mm. */
    private function circle(float $D): void
    {
        $d = $this->d;
        $brand = $d['brand'];
        $c = $d['contact'];
        $r = $D / 2;
        $k = $D / 40;
        $chord = fn (float $y): float => max(8.0, 2 * sqrt(max(0.0, $r * $r - ($y - $r) * ($y - $r))) - 2.4 * $k);
        $mid = fn (float $y): float => ($D - $chord($y)) / 2;
        $put = function (float $base, float $up, string $font, float $max, float $min, string $color, string $t, float $bold = 0.0) use ($chord, $mid): void {
            $w = $chord($base - $up);
            $pt = LabelText::fitPt($t, $font, $w, $max, $min);
            $this->text($mid($base - $up), $base, $w, 'c', $font, $pt, $color, $t, $bold);
        };

        // Brand line, heading, rule, name.
        if ($this->dv) {
            $put(6.9 * $k, 1.2 * $k, 'dv', 5.4 * $k, 3.6, StickerDesign::PRIMARY, $brand['name_dv'], 0.5);
            $put(11.6 * $k, 2.0 * $k, 'dv', 8.0 * $k, 4.6, StickerDesign::DARK, $d['header_line_dv'], 0.6);
        } else {
            $line = StickerDesign::spaced(mb_strtoupper($brand['name']));
            $put(6.6 * $k, 1.2 * $k, 'j7', 4.4 * $k, 3.0, StickerDesign::PRIMARY, $line);
            $put(11.2 * $k, 2.0 * $k, 'j8', 6.6 * $k, 3.8, StickerDesign::DARK, $d['header_line']);
        }
        $this->box(($D - 8 * $k) / 2, 12.6 * $k, 8 * $k, 0.6 * $k, StickerDesign::PRIMARY);
        $useDv = $this->dv && $d['name_dv'] !== '';
        $put(19.4 * $k, 3.6 * $k, $useDv ? 'dv' : 'dsi', ($useDv ? 13.0 : 12.0) * $k, 6.0, StickerDesign::PRIMARY, $useDv ? $d['name_dv'] : $d['name'], $useDv ? 0.7 : 0.0);

        // The dates on two lines.
        $blank = '__ / __ / ____';
        $rows = $this->dv
            ? [['ހެދި', $d['mfg']], ['ހަމަވާ', $d['exp']]]
            : [[$d['mfg_label'], $d['mfg']], [$d['exp_label'], $d['exp']]];
        foreach ($rows as $i => [$label, $date]) {
            $base = (24.6 + 3.6 * $i) * $k;
            $t = $this->dv ? ($date ?: $blank) . '  :' . $label : $label . ':  ' . ($date ?: $blank);
            $put($base, 0.0, $this->dv ? 'dv' : 'j7', ($this->dv ? 6.2 : 5.0) * $k, 3.2, $i === 0 ? StickerDesign::DARK : StickerDesign::PRIMARY, $t, $this->dv ? 0.5 : 0.0);
        }

        // Storage strip (its first clause when the line is long) and the phone.
        $sy = 29.6 * $k;
        $sh = 3.4 * $k;
        $sw = $chord($sy + $sh / 2) - 0.6;
        $this->box(($D - $sw) / 2, $sy, $sw, $sh, StickerDesign::PRIMARY, 0.8);
        $msg = $this->shortStorage($sw - 1.6, $this->dv ? 4.4 : 3.6);
        $font = $this->dv ? 'dv' : 'j7';
        $pt = LabelText::fitPt($msg, $font, $sw - 1.6, ($this->dv ? 5.4 : 4.2) * $k, 3.0);
        $this->text(($D - $sw) / 2 + 0.8, $this->baseCentred($sy, $sh, $font, $pt), $sw - 1.6, 'c', $font, $pt, StickerDesign::CREAM, $msg, $this->dv ? 0.6 : 0.0);
        if ($D >= 34 && $c['phone'] !== '') {
            $put(36.0 * $k, 1.4 * $k, 'j7', 4.2 * $k, 3.0, StickerDesign::DARK, $c['phone']);
        }
    }

    // ---- Pieces ----

    private function header(float $x, float $y, float $bw, float $hb, float $qr, float $k): void
    {
        $d = $this->d;
        $brand = $d['brand'];
        $this->box($x, $y, $bw, $hb, StickerDesign::TINT, min(2.0, $hb * 0.18));
        $logo = $brand['logo'] ?: $d['mark'];
        $lw = 0.0;
        if ($logo) {
            [$lw, $lh] = StickerDesign::fit($brand['logo'] ? $brand['logo_ratio'] : $d['mark_ratio'], $hb * 1.25, $hb - 1.4);
            $this->img($this->X($x + 0.9, $lw), $y + ($hb - $lh) / 2, $lw, $lh, $logo);
        }
        if ($qr > 0) {
            $qy = $y + ($hb - $qr) / 2;
            $qx = $x + $bw - 0.7 - $qr;
            $this->box($this->X($qx - 0.35, $qr + 0.7), $qy - 0.35, $qr + 0.7, $qr + 0.7, StickerDesign::CREAM, 0.5);
            $this->img($this->X($qx, $qr), $qy, $qr, $qr, $d['qr']);
        }
        $tx = $x + 0.9 + ($lw > 0 ? $lw + 1.3 : 0.4);
        $tw = $x + $bw - 0.9 - ($qr > 0 ? $qr + 1.1 : 0.0) - $tx;
        $two = $hb >= 7.6;
        if ($this->dv) {
            $head = $d['header_line_dv'];
            if ($two) {
                $pt = LabelText::fitPt($brand['name_dv'], 'dv', $tw, $hb * 0.58, 3.6);
                $this->text($this->X($tx, $tw), $y + $hb * 0.42, $tw, 'r', 'dv', $pt, StickerDesign::PRIMARY, $brand['name_dv'], 0.5);
                $pt = LabelText::fitPt($head, 'dv', $tw, $hb * 0.98, 4.4);
                $this->text($this->X($tx, $tw), $y + $hb * 0.84, $tw, 'r', 'dv', $pt, StickerDesign::DARK, $head, 0.6);
            } else {
                $pt = LabelText::fitPt($head, 'dv', $tw, $hb * 1.15, 4.0);
                $this->text($this->X($tx, $tw), $this->baseCentred($y, $hb, 'dv', $pt), $tw, 'r', 'dv', $pt, StickerDesign::DARK, $head, 0.6);
            }

            return;
        }
        if ($two) {
            $line = StickerDesign::spaced(mb_strtoupper($brand['name']));
            $pt = LabelText::fitPt($line, 'j7', $tw, min(5.4, $hb * 0.5), 3.0);
            $this->text($tx, $y + $hb * 0.38, $tw, 'l', 'j7', $pt, StickerDesign::PRIMARY, $line);
            $pt = LabelText::fitPt($d['header_line'], 'j8', $tw, $hb * 0.8, 3.8);
            $this->text($tx, $y + $hb * 0.8, $tw, 'l', 'j8', $pt, StickerDesign::DARK, $d['header_line']);
        } else {
            $pt = LabelText::fitPt($d['header_line'], 'j8', $tw, $hb * 0.95, 3.6);
            $this->text($tx, $this->baseCentred($y, $hb, 'j8', $pt), $tw, 'l', 'j8', $pt, StickerDesign::DARK, $d['header_line']);
        }
    }

    /** The product name: the hand lettering when there is some, else typed, on one or two lines. */
    private function name(float $x, float $y, float $bw, float $nh, string $align, float $k): void
    {
        $d = $this->d;
        $useDv = $this->dv && $d['name_dv'] !== '';
        if ($d['title_img'] && !$useDv) {
            [$tw, $th] = StickerDesign::fit($d['title_ratio'], $bw, $nh);
            $tx = $align === 'c' ? $x + ($bw - $tw) / 2 : $x;
            $this->img($this->X($tx, $tw), $y + ($nh - $th) / 2, $tw, $th, $d['title_img']);

            return;
        }
        $t = $useDv ? $d['name_dv'] : $d['name'];
        $font = $useDv ? 'dv' : 'dsi';
        $lineK = (LabelText::ascent($font) + LabelText::descent($font)) * LabelText::PT;
        $min = $useDv ? 6.0 : 5.5;
        // One line as big as fits; a long name that will not fit at the
        // smallest size goes onto two lines when the box is tall enough.
        $pt = LabelText::fitPt($t, $font, $bw, min(18.0, $nh / $lineK), $min);
        $lines = [$t];
        if (LabelText::widthMm($t, $pt, $font) > $bw * 1.01) {
            for ($try = min(14.0, $nh / (2 * $lineK)); $try >= $min - 0.01; $try -= 0.25) {
                $wrapped = LabelText::wrap($t, $try, $bw, $font);
                if (count($wrapped) <= 2) {
                    [$pt, $lines] = [round($try, 2), $wrapped];
                    break;
                }
            }
        }
        $lh = $lineK * $pt;
        $top = $y + max(0.0, ($nh - $lh * count($lines)) / 2);
        foreach ($lines as $i => $l) {
            $this->text($this->X($x, $bw), $top + $i * $lh + LabelText::ascent($font) * $pt * LabelText::PT, $bw, $this->A($align), $font, $pt, StickerDesign::PRIMARY, $l, $useDv ? 0.7 : 0.0);
        }
    }

    /** Made-on and expiry boxes, side by side or one above the other. */
    private function dates(float $x, float $y, float $bw, float $height, float $bh, bool $side, float $k): void
    {
        $d = $this->d;
        $rows = $this->dv
            ? [['ހެދި ތާރީޚު', 'ހެދި', StickerDesign::DARK, $d['mfg']], ['ހަމަވާ ތާރީޚު', 'ހަމަވާ', StickerDesign::PRIMARY, $d['exp']]]
            : [[$d['mfg_label'], $d['mfg_label'], StickerDesign::DARK, $d['mfg']], [$d['exp_label'], $d['exp_label'], StickerDesign::PRIMARY, $d['exp']]];
        $g = $side ? 1.6 * $k : max(0.6, ($height - 2 * $bh));
        $boxW = $side ? ($bw - $g) / 2 : $bw;
        foreach ($rows as $i => [$long, $short, $colour, $date]) {
            $bx = $side ? $this->X($x + $i * ($boxW + $g), $boxW) : $this->X($x, $boxW);
            $by = $side ? $y : $y + $i * ($bh + $g);
            $this->dateBox($bx, $by, $boxW, $bh, $long, $short, $colour, $date);
        }
    }

    private function dateBox(float $x, float $y, float $bw, float $bh, string $long, string $short, string $colour, ?string $date): void
    {
        $strip = round(max(2.0, $bh * 0.4), 2);
        $r = min(1.3, $bh * 0.16);
        $this->p[] = ['t' => 'rect', 'x' => $x, 'y' => $y, 'w' => $bw, 'h' => $bh, 'fill' => StickerDesign::CREAM, 'stroke' => $colour, 'sw' => 0.3, 'r' => $r];
        $this->p[] = ['t' => 'rect', 'x' => $x, 'y' => $y, 'w' => $bw, 'h' => $strip, 'fill' => $colour, 'r' => $r, 'rb' => 0];
        $inner = $bw - 1.2;
        if ($this->dv) {
            $label = LabelText::fitPt($long, 'dv', $inner, $strip * 1.9, 3.4) >= 4.6 ? $long : $short;
            $pt = LabelText::fitPt($label, 'dv', $inner, $strip * 1.9, 3.4);
            $this->text($x + 0.6, $this->baseCentred($y, $strip, 'dv', $pt), $inner, 'c', 'dv', $pt, StickerDesign::CREAM, $label, 0.5);
        } else {
            $pt = LabelText::fitPt($long, 'j7', $inner, $strip * 1.5, 2.8);
            $this->text($x + 0.6, $this->baseCentred($y, $strip, 'j7', $pt), $inner, 'c', 'j7', $pt, StickerDesign::CREAM, $long);
        }
        $t = $date ?: '__ /__ /____';
        $font = $date ? 'j7' : 'j4';
        $pt = LabelText::fitPt($t, $font, $inner, ($bh - $strip) * 1.75, 3.4);
        $this->text($x + 0.6, $this->baseCentred($y + $strip, $bh - $strip, $font, $pt), $inner, 'c', $font, $pt, $date ? StickerDesign::TEXT : StickerDesign::SOFT, $t);
    }

    /** The dates as two short lines, for a column too short for boxes: label above date when there is height, else beside it. */
    private function dateLines(float $x, float $y, float $bw, float $height, float $k): void
    {
        $d = $this->d;
        $blank = '__ /__ /____';
        $rows = $this->dv
            ? [['ހެދި', StickerDesign::DARK, $d['mfg']], ['ހަމަވާ', StickerDesign::PRIMARY, $d['exp']]]
            : [[$d['mfg_label'], StickerDesign::DARK, $d['mfg']], [$d['exp_label'], StickerDesign::PRIMARY, $d['exp']]];
        $stacked = $height >= 9.0;
        $rowH = $height / 2;
        foreach ($rows as $i => [$label, $colour, $date]) {
            $top = $y + $i * $rowH;
            $t = $date ?: $blank;
            $dateFont = $date ? 'j7' : 'j4';
            if ($stacked) {
                $lf = $this->dv ? 'dv' : 'j7';
                $lpt = LabelText::fitPt($label, $lf, $bw, $this->dv ? $rowH * 1.1 : $rowH * 0.85, 3.0);
                $dpt = LabelText::fitPt($t, $dateFont, $bw, $rowH * 1.3, 3.2);
                $lineL = (LabelText::ascent($lf) + LabelText::descent($lf)) * $lpt * LabelText::PT;
                $lineD = 0.78 * $dpt * LabelText::PT;
                $gap = max(0.2, ($rowH - $lineL - $lineD) / 3);
                $this->text($this->X($x, $bw), $top + $gap + LabelText::ascent($lf) * $lpt * LabelText::PT * 0.92, $bw, $this->A('l'), $lf, $lpt, $colour, $label, $this->dv ? 0.5 : 0.0);
                $this->text($this->X($x, $bw), $top + $gap + $lineL + $gap * 0.6 + $lineD, $bw, $this->A('l'), $dateFont, $dpt, $date ? StickerDesign::TEXT : StickerDesign::SOFT, $t);
            } else {
                $line = $this->dv ? $t . '  :' . $label : $label . '  ' . $t;
                $font = $this->dv ? 'dv' : 'j7';
                $pt = LabelText::fitPt($line, $font, $bw, $rowH * 1.6, 3.0);
                $this->text($this->X($x, $bw), $this->baseCentred($top, $rowH, $font, $pt), $bw, $this->A('l'), $font, $pt, $colour, $line, $this->dv ? 0.5 : 0.0);
            }
        }
    }

    /** Ingredients: a small heading and the list, as big as fits; returns the height used. */
    private function ingredients(float $x, float $y, float $bw, float $height, float $k, string $align): float
    {
        $plan = $this->planIngredients($bw, $height, $k);
        if ($plan === null) {
            return 0.0;
        }
        $this->drawIngredients($plan, $x, $y, $bw, $align);

        return $plan['height'];
    }

    /**
     * The list at the biggest size that fits in full; at the smallest size,
     * the lines that fit with "…" on the last.
     *
     * @return array{lines: list<string>, pt: float, lead: float, headPt: float, headH: float, height: float}|null
     */
    private function planIngredients(float $bw, float $height, float $k): ?array
    {
        $t = $this->ingredientsText();
        if ($t === '' || $height <= 0) {
            return null;
        }
        $font = $this->dv ? 'dv' : 'j4';
        $headPt = $this->dv ? self::clamp(5.6 * $k, 4.4, 7.0) : self::clamp(4.0 * $k, 3.2, 5.0);
        $headH = ($this->dv ? 1.25 : 1.15) * $headPt * LabelText::PT + 0.45;
        $room = $height - $headH;
        $max = $this->dv ? self::clamp(6.4 * $k, 4.8, 8.0) : self::clamp(5.2 * $k, 4.0, 6.4);
        $min = $this->dv ? 4.4 : 3.4;
        $lines = [];
        $lead = 0.0;
        $full = false;
        for ($pt = $max; $pt >= $min - 0.01; $pt -= 0.2) {
            $lead = $pt * ($this->dv ? 1.42 : 1.22) * LabelText::PT;
            $lines = LabelText::wrap($t, $pt, $bw, $font);
            if (count($lines) * $lead <= $room) {
                $full = true;
                break;
            }
        }
        $pt = max($min, round($pt, 2));
        $fit = max(0, (int) floor($room / $lead));
        if ($fit === 0) {
            return null;
        }
        if (!$full && count($lines) > $fit) {
            $lines = array_slice($lines, 0, $fit);
            $last = rtrim((string) array_pop($lines), ' ,،');
            while ($last !== '' && LabelText::widthMm($last . '…', $pt, $font) > $bw) {
                $last = rtrim(mb_substr($last, 0, -1), ' ,،');
            }
            $lines[] = $last . '…';
        }

        return ['lines' => $lines, 'pt' => $pt, 'lead' => $lead, 'headPt' => $headPt, 'headH' => $headH, 'height' => $headH + count($lines) * $lead + 0.4];
    }

    /** @param array{lines: list<string>, pt: float, lead: float, headPt: float, headH: float, height: float} $plan */
    private function drawIngredients(array $plan, float $x, float $y, float $bw, string $align): void
    {
        $font = $this->dv ? 'dv' : 'j4';
        $a = $this->A($align);
        $headPt = $plan['headPt'];
        $this->dv
            ? $this->text($this->X($x, $bw), $y + 0.9 * $headPt * LabelText::PT + 0.2, $bw, $a, 'dv', $headPt, StickerDesign::PRIMARY, 'ހިމެނޭ ތަކެތި', 0.5)
            : $this->text($this->X($x, $bw), $y + 0.78 * $headPt * LabelText::PT + 0.2, $bw, $a, 'j7', $headPt, StickerDesign::PRIMARY, StickerDesign::spaced('INGREDIENTS'));
        foreach ($plan['lines'] as $i => $l) {
            $base = $y + $plan['headH'] + $i * $plan['lead'] + ($this->dv ? 0.95 : 0.8) * $plan['pt'] * LabelText::PT;
            $this->text($this->X($x, $bw), $base, $bw, $a, $font, $plan['pt'], StickerDesign::TEXT, $l, $this->dv ? 0.4 : 0.0, $this->dv ? [] : ($this->d['allergens'] ?? []));
        }
    }

    private function noteLine(float $x, float $y, float $bw, float $lh, float $k, string $align): void
    {
        $t = $this->noteText();
        $font = $this->dv ? 'dv' : 'j7';
        $pt = LabelText::fitPt($t, $font, $bw, $this->dv ? $lh * 1.9 : $lh * 1.45, 3.0);
        $this->text($this->X($x, $bw), $this->baseCentred($y, $lh, $font, $pt), $bw, $this->A($align), $font, $pt, StickerDesign::PRIMARY, $t, $this->dv ? 0.5 : 0.0);
    }

    private function withinLine(float $x, float $y, float $bw, float $lh, float $k): void
    {
        $t = $this->withinText();
        $font = $this->dv ? 'dv' : 'j7';
        $pt = LabelText::fitPt($t, $font, $bw, $this->dv ? $lh * 1.8 : $lh * 1.4, 3.0);
        $this->text($this->X($x, $bw), $this->baseCentred($y, $lh, $font, $pt), $bw, 'c', $font, $pt, StickerDesign::PRIMARY, $t, $this->dv ? 0.5 : 0.0);
    }

    private function batchLine(float $x, float $y, float $bw, float $lh, float $k): void
    {
        $d = $this->d;
        $half = $bw / 2;
        if ($this->dv) {
            $font = 'dv';
            $b = 'ބެޗް: ' . ($d['batch'] !== '' ? $d['batch'] : '..........');
            $q = 'އަދަދު: ' . ($d['qty'] !== '' ? $d['qty'] : '......');
        } else {
            $font = 'j5';
            $b = 'BATCH: ' . ($d['batch'] !== '' ? $d['batch'] : '________');
            // The price and net weight (2026-10-12) ride on the quantity when the label is wide enough to read them.
            $q = 'QTY: ' . ($d['qty'] !== '' ? $d['qty'] : '____') . ' ' . $d['unit'];
            if ($half >= 22 && $d['net_weight'] !== '') {
                $q .= ' · ' . $d['net_weight'];
            }
            if ($half >= 18 && $d['price'] !== '') {
                $q = $d['price'] . ' · ' . $q;
            }
        }
        $max = $this->dv ? $lh * 1.8 : $lh * 1.45;
        $pt = min(LabelText::fitPt($b, $font, $half - 0.6, $max, 3.0), LabelText::fitPt($q, $font, $half - 0.6, $max, 3.0));
        $base = $this->baseCentred($y, $lh, $font, $pt);
        $this->text($this->X($x, $half), $base, $half, $this->A('l'), $font, $pt, StickerDesign::TEXT, $b, $this->dv ? 0.4 : 0.0);
        $this->text($this->X($x + $half, $half), $base, $half, $this->A('r'), $font, $pt, StickerDesign::TEXT, $q, $this->dv ? 0.4 : 0.0);
    }

    private function strip(float $x, float $y, float $bw, float $sh, float $k): void
    {
        $this->box($x, $y, $bw, $sh, StickerDesign::PRIMARY, min(1.0, $sh * 0.3));
        $font = $this->dv ? 'dv' : 'j7';
        [$lines, $pt] = $this->stripText($bw - 1.6, $sh);
        $rowH = $sh / count($lines);
        foreach ($lines as $i => $l) {
            $this->text($x + 0.8, $this->baseCentred($y + $i * $rowH + (count($lines) > 1 ? ($i === 0 ? 0.2 : -0.2) : 0.0), $rowH, $font, $pt), $bw - 1.6, 'c', $font, $pt, StickerDesign::CREAM, $l, $this->dv ? 0.7 : 0.0);
        }
    }

    /**
     * The storage line for a strip: one line (its first clause if the whole
     * line is too long), or two on a label too narrow for one.
     *
     * @return array{0: list<string>, 1: float}
     */
    private function stripText(float $avail, float $sh): array
    {
        $font = $this->dv ? 'dv' : 'j7';
        $min = $this->dv ? 3.6 : 2.8;
        $msg = $this->shortStorage($avail, $this->dv ? 4.4 : 3.6);
        $pt = LabelText::fitPt($msg, $font, $avail, $this->dv ? $sh * 1.75 : $sh * 1.4, $min);
        if (LabelText::widthMm($msg, $pt, $font) <= $avail * 1.01) {
            return [[$msg], $pt];
        }
        $per = $sh / 2;
        for ($try = $this->dv ? $per * 1.7 : $per * 1.4; $try >= ($this->dv ? 3.0 : 2.4); $try -= 0.2) {
            $lines = LabelText::wrap($msg, $try, $avail, $font);
            if (count($lines) <= 2) {
                return [$lines, round($try, 2)];
            }
        }

        return [[$msg], $min];
    }

    /** A strip tall enough for its storage line: taller when the line needs two rows. */
    private function stripHeight(float $bw, float $sh): float
    {
        $font = $this->dv ? 'dv' : 'j7';
        $min = $this->dv ? 3.6 : 2.8;
        $msg = $this->shortStorage($bw - 1.6, $this->dv ? 4.4 : 3.6);

        return LabelText::widthMm($msg, $min, $font) > ($bw - 1.6) * 1.01 ? max($sh, 4.4) : $sh;
    }

    /** The dark footer: brand name, phone, and the website when it fits. */
    private function footerBand(float $x, float $y, float $bw, float $fh, float $k): void
    {
        $d = $this->d;
        $brand = $d['brand'];
        $c = $d['contact'];
        $this->box($x, $y, $bw, $fh, StickerDesign::DARK, min(1.3, $fh * 0.25));
        $inner = $bw - 2.0;
        $site = $inner >= 62 && $c['website'] !== '';
        $part = $site ? $inner / 3 : $inner / 2;
        $maxPt = $fh * 1.45;
        $namePt = LabelText::fitPt($brand['name'], 'ds', $part - 0.6, $maxPt * 1.15, 3.6);
        $this->text($this->X($x + 1.0, $part), $this->baseCentred($y, $fh, 'ds', $namePt), $part, $this->A('l'), 'ds', $namePt, StickerDesign::CREAM, $brand['name']);
        if ($c['phone'] !== '') {
            $pt = LabelText::fitPt($c['phone'], 'j8', $part - 0.6, $maxPt, 3.2);
            $this->text($this->X($x + 1.0 + $inner - $part, $part), $this->baseCentred($y, $fh, 'j8', $pt), $part, $this->A('r'), 'j8', $pt, StickerDesign::CREAM, $c['phone']);
        }
        if ($site) {
            $pt = LabelText::fitPt($c['website'], 'dsi', $part - 0.6, $maxPt * 1.1, 3.2);
            $this->text($this->X($x + 1.0 + $part, $part), $this->baseCentred($y, $fh, 'dsi', $pt), $part, 'c', 'dsi', $pt, StickerDesign::ON_DARK, $c['website']);
        }
    }

    /** Phone and website on one plain line, when there is no room for the band. */
    private function footerLine(float $x, float $y, float $bw, float $lh, float $k): void
    {
        $c = $this->d['contact'];
        $t = implode('  ·  ', array_filter([$c['phone'], $c['website']], fn ($s) => $s !== ''));
        if ($t === '') {
            return;
        }
        $pt = LabelText::fitPt($t, 'j7', $bw, $lh * 1.4, 3.0);
        $this->text($x, $this->baseCentred($y, $lh, 'j7', $pt), $bw, 'c', 'j7', $pt, StickerDesign::DARK, $t);
    }

    private function qr(float $x, float $y, float $size): void
    {
        $this->box($this->X($x - 0.4, $size + 0.8), $y - 0.4, $size + 0.8, $size + 0.8, StickerDesign::CREAM, 0.6, StickerDesign::SOFT);
        $this->img($this->X($x, $size), $y, $size, $size, $this->d['qr']);
    }

    /** The picture and the QR side by side, centred (either alone when the other is missing). */
    private function pictureAndQr(float $x, float $y, float $bw, float $bh, float $qr): void
    {
        $d = $this->d;
        $pic = $d['photo'] && $bh >= 8.0 ? StickerDesign::fit($d['photo_ratio'], ($qr > 0 ? $bw - $qr - 2.0 : $bw) * 0.9, $bh - 0.6) : null;
        $total = ($pic ? $pic[0] : 0.0) + ($pic && $qr > 0 ? 2.0 : 0.0) + $qr;
        if ($total <= 0) {
            return;
        }
        $cx = $x + ($bw - $total) / 2;
        if ($pic) {
            $this->img($this->X($cx, $pic[0]), $y + ($bh - $pic[1]) / 2, $pic[0], $pic[1], $d['photo']);
            $cx += $pic[0] + 2.0;
        }
        if ($qr > 0) {
            $this->qr($cx, $y + ($bh - $qr) / 2, $qr);
        }
    }

    /** The cut-out photo, when the item has one (no flame: the header already carries the logo). */
    private function picture(float $x, float $y, float $bw, float $bh, string $align = 'c'): void
    {
        $d = $this->d;
        if (!$d['photo']) {
            return;
        }
        [$pw, $ph] = StickerDesign::fit($d['photo_ratio'], $bw * 0.9, $bh - 0.6);
        $px = $align === 'c' ? $x + ($bw - $pw) / 2 : $x;
        $this->img($this->X($px, $pw), $y + ($bh - $ph) / 2, $pw, $ph, $d['photo']);
    }

    // ---- Helpers ----

    private function ingredientsText(): string
    {
        return (string) ($this->dv ? $this->d['ingredients_dv'] : $this->d['ingredients_en']);
    }

    private function noteText(): string
    {
        return (string) ($this->dv ? $this->d['note_dv'] : $this->d['note']);
    }

    private function withinText(): string
    {
        return (string) ($this->dv ? $this->d['use_within_dv'] : $this->d['use_within']);
    }

    private function qrFits(): bool
    {
        return !empty($this->d['show_qr']) && !empty($this->d['qr']);
    }

    /** The heading and two lines of the list: what ingredients need before they are worth printing. */
    private function ingredientsMin(float $k): float
    {
        $head = $this->dv ? self::clamp(5.6 * $k, 4.4, 7.0) * 1.2 : self::clamp(4.0 * $k, 3.2, 5.0) * 1.05;
        $body = $this->dv ? 4.4 * 1.42 : 3.4 * 1.22;

        return ($head + 2 * $body) * LabelText::PT + 0.7;
    }

    /** The storage line, cut to its first clause when the whole line would not fit at the smallest size. */
    private function shortStorage(float $width, float $minPt): string
    {
        $msg = (string) ($this->dv ? $this->d['storage_dv'] : $this->d['storage_en']);
        $font = $this->dv ? 'dv' : 'j7';
        if (LabelText::widthMm($msg, $minPt, $font) > $width && preg_match('/^(.+?)\s+[•·]\s+/u', $msg, $m)) {
            return trim($m[1]);
        }

        return $msg;
    }

    /** The baseline that centres a line's capitals (Thaana's body for Dhivehi) in a band. */
    private function baseCentred(float $top, float $height, string $font, float $pt): float
    {
        $body = ($font === 'dv' ? 0.5 : ($font === 'ds' || $font === 'dsi' ? 0.7 : 0.72)) * $pt * LabelText::PT;

        return $top + ($height + $body) / 2 + ($font === 'dv' ? 0.1 * $pt * LabelText::PT : 0.0);
    }

    private function take(float &$free, float $height): bool
    {
        if ($free >= $height) {
            $free -= $height;

            return true;
        }

        return false;
    }

    private function k(float $short): float
    {
        return self::clamp($short / 40, 0.6, 1.4);
    }

    private function pad(float $k): float
    {
        return round(self::clamp(1.8 * $k, 1.3, 2.4), 2);
    }

    private function gap(float $k): float
    {
        return round(self::clamp(0.9 * $k, 0.6, 1.3), 2);
    }

    private static function clamp(float $v, float $min, float $max): float
    {
        return round(max($min, min($max, $v)), 3);
    }

    /** Mirror a box for the Dhivehi sticker. */
    private function X(float $x, float $bw = 0.0): float
    {
        return $this->dv ? $this->w - $x - $bw : $x;
    }

    private function A(string $align): string
    {
        return $this->dv ? ['l' => 'r', 'r' => 'l', 'c' => 'c'][$align] : $align;
    }

    private function text(float $x, float $base, float $bw, string $align, string $font, float $pt, string $color, string $t, float $bold = 0.0, array $boldWords = []): void
    {
        if (trim($t) === '') {
            return;
        }
        $this->p[] = ['t' => 'text', 'x' => round($x, 3), 'base' => round($base, 3), 'w' => round($bw, 3), 'align' => $align, 'font' => $font, 'pt' => round($pt, 2), 'color' => $color, 'text' => $t] + ($bold > 0 ? ['bold' => $bold] : []) + ($boldWords !== [] ? ['bold_words' => $boldWords] : []);
    }

    private function box(float $x, float $y, float $bw, float $bh, string $fill, float $r = 0.0, ?string $stroke = null): void
    {
        $this->p[] = ['t' => 'rect', 'x' => round($x, 3), 'y' => round($y, 3), 'w' => round($bw, 3), 'h' => round($bh, 3), 'fill' => $fill] + ($r > 0 ? ['r' => round($r, 3)] : []) + ($stroke ? ['stroke' => $stroke, 'sw' => 0.2] : []);
    }

    private function img(float $x, float $y, float $bw, float $bh, string $src): void
    {
        $this->p[] = ['t' => 'img', 'x' => round($x, 3), 'y' => round($y, 3), 'w' => round($bw, 3), 'h' => round($bh, 3), 'src' => $src];
    }
}
