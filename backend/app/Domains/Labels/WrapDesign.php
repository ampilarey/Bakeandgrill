<?php

declare(strict_types=1);

namespace App\Domains\Labels;

/**
 * The wrap-around label (owner, 2026-10-12: a juice bottle's label "with 2,
 * 3, 4, 5 different parts"): a wide, short label whose parts sit side by
 * side, each a column, with a flavour band along the bottom. Which parts, in
 * what order, come from WrapConfig (the item's Label tab or the custom
 * label's editor); a part with nothing to print is left out. Pieces in
 * millimetres from the label's top-left corner, in StickerDesign's piece
 * format, so the web sheet, the PDF and the thermal bitmap draw the same.
 *
 * Reference size 180 × 40 mm (the bottle label the owner showed); type and
 * spacing scale with the height between 30 and 60 mm. In Dhivehi the parts
 * run right to left and text sits to the right.
 */
final class WrapDesign
{
    /** @var list<array<string, mixed>> */
    private array $p = [];

    private readonly float $k;

    private readonly bool $both;

    /** @var list<string> the parts that print, once the width is shared out */
    private array $parts = [];

    /**
     * part => [the width it asks for (mm), its share of what is left, the
     * least it prints in when squeezed]. A share of 0 is a fixed-width part
     * (its width comes from the label's height) that only gives way when
     * squeezed.
     */
    private const PARTS = [
        'brand' => [30.0, 1.5, 22.0],
        'legal' => [36.0, 2.1, 24.0],
        'nutrition' => [24.0, 1.0, 17.0],
        'dates' => [26.0, 1.3, 20.0],
        'barcode' => [0.0, 0.0, 20.0],
        'qr' => [0.0, 0.0, 11.0],
        'marks' => [0.0, 0.0, 8.0],
        'text' => [22.0, 1.1, 16.0],
        'packed' => [22.0, 0.9, 16.0],
    ];

    /** When the parts do not fit the width even squeezed, they go in this order (the brand and the dates stay). */
    private const DROP_ORDER = ['text', 'packed', 'marks', 'qr', 'barcode', 'nutrition', 'legal'];

    /** @param array<string, mixed> $d see StickerSheet::stickerData() */
    private function __construct(private readonly array $d, private readonly bool $dv, private readonly float $w, private readonly float $h)
    {
        $this->k = self::clamp($h / 40.0, 0.75, 1.5);
        $this->both = !$dv && !empty($d['both']);
    }

    /**
     * @param array<string, mixed> $d
     * @return list<array<string, mixed>>
     */
    public static function wrap(array $d, bool $dv, float $w, float $h): array
    {
        $s = new self($d, $dv, $w, $h);
        $s->draw();

        return $s->p;
    }

    // ---- Layout ----

    private function draw(): void
    {
        $d = $this->d;
        $k = $this->k;
        $wrap = $d['wrap'];
        $pad = self::clamp(1.5 * $k, 1.1, 2.4);
        $gap = self::clamp(1.8 * $k, 1.2, 2.8);
        $iw = $this->w - 2 * $pad;
        $band = !empty($wrap['band']);
        $bh = $band ? self::clamp($this->h * 0.19, 5.4, 9.0) : 0.0;
        $top = $pad;
        $ph = $this->h - 2 * $pad - ($band ? $bh + 0.7 * $gap : 0.0);

        $parts = array_values(array_filter($wrap['parts'], fn (string $part) => $this->has($part)));
        if ($parts === []) {
            $parts = ['brand'];
        }

        // What each part asks for: the fixed ones (barcode, QR, marks) from the
        // label's height, the rest their own width; then the width is shared.
        $asks = [];
        foreach ($parts as $part) {
            $asks[$part] = match ($part) {
                'barcode' => min(30.0, max(22.0, $ph * 0.9)),
                'qr' => self::clamp($ph * 0.62, 10.0, 20.0),
                'marks' => $this->marksWidth($ph),
                default => self::PARTS[$part][0],
            };
        }
        $widths = $this->share($parts, $asks, $iw, $gap);
        $this->parts = $parts = array_keys($widths);

        // Dhivehi reads right to left: the brand at the right, the parts in reverse.
        $ordered = $this->dv ? array_reverse($parts) : $parts;
        $x = $pad;
        foreach ($ordered as $i => $part) {
            $pw = $widths[$part];
            if ($i > 0) {
                $this->p[] = ['t' => 'rect', 'x' => round($x - $gap / 2 - 0.1, 3), 'y' => $top + 1.0, 'w' => 0.2, 'h' => $ph - 2.0, 'fill' => StickerDesign::BORDER];
            }
            match ($part) {
                'brand' => $this->brand($x, $top, $pw, $ph),
                'legal' => $this->legal($x, $top, $pw, $ph),
                'nutrition' => $this->nutrition($x, $top, $pw, $ph),
                'dates' => $this->dates($x, $top, $pw, $ph),
                'barcode' => $this->barcode($x, $top, $pw, $ph),
                'qr' => $this->qr($x, $top, $pw, $ph),
                'marks' => $this->marks($x, $top, $pw, $ph),
                'text' => $this->freeText($x, $top, $pw, $ph),
                'packed' => $this->packed($x, $top, $pw, $ph),
            };
            $x += $pw + $gap;
        }

        if ($band) {
            $this->band($pad, $this->h - $pad - $bh, $iw, $bh);
        }
    }

    /**
     * Each part's width across $iw: what it asks for plus a share of what is
     * left, by weight. When the asks do not fit, every part gives up the same
     * share, none below its floor (a QR must still scan, a barcode too); when
     * the floors do not fit either, the parts go in DROP_ORDER until they do.
     *
     * @param list<string> $parts
     * @param array<string, float> $asks
     * @return array<string, float> part => width, in the order given
     */
    private function share(array $parts, array $asks, float $iw, float $gap): array
    {
        while (true) {
            $line = $iw - (count($parts) - 1) * $gap;
            $asked = array_sum(array_map(fn (string $part) => $asks[$part], $parts));
            $widths = [];
            if ($asked <= $line) {
                $weights = array_sum(array_map(fn (string $part) => self::PARTS[$part][1], $parts));
                foreach ($parts as $part) {
                    $widths[$part] = $asks[$part] + ($weights > 0 ? ($line - $asked) * self::PARTS[$part][1] / $weights : 0.0);
                }

                return $widths;
            }
            // Squeeze: scale the parts not yet at their floor until the rest fit, or nothing moves.
            $floored = [];
            for ($round = 0; $round <= count($parts); $round++) {
                $free = array_values(array_filter($parts, fn (string $part) => !in_array($part, $floored, true)));
                $room = $line - array_sum(array_map(fn (string $part) => self::PARTS[$part][2], $floored));
                $scale = $free === [] ? 0.0 : $room / max(0.001, array_sum(array_map(fn (string $part) => $asks[$part], $free)));
                $moved = false;
                foreach ($free as $part) {
                    if (self::PARTS[$part][2] - 0.001 > $asks[$part] * $scale) {
                        $floored[] = $part;
                        $moved = true;
                    }
                }
                if (!$moved) {
                    foreach ($parts as $part) {
                        $widths[$part] = in_array($part, $floored, true) ? self::PARTS[$part][2] : $asks[$part] * $scale;
                    }
                    if ($free !== [] || abs(array_sum($widths) - $line) < 0.01) {
                        return $widths;
                    }
                    break;
                }
            }
            // Even the floors do not fit: let a part go. The last one left takes the whole width.
            $drop = null;
            foreach (self::DROP_ORDER as $candidate) {
                if (in_array($candidate, $parts, true) && count($parts) > 1) {
                    $drop = $candidate;
                    break;
                }
            }
            if ($drop === null) {
                $keep = count($parts) > 1 ? ['brand'] : $parts;

                return [$keep[0] => $iw];
            }
            $parts = array_values(array_filter($parts, fn (string $part) => $part !== $drop));
        }
    }

    /** Whether a part has anything to print. */
    private function has(string $part): bool
    {
        $d = $this->d;

        return match ($part) {
            'brand', 'legal', 'dates' => true,
            'barcode' => !empty($d['barcode']),
            'nutrition' => is_array($d['nutrition'] ?? null),
            'qr' => !empty($d['batch_qr']) || (!empty($d['show_qr']) && !empty($d['qr'])),
            'marks' => ($d['marks'] ?? []) !== [] || ($d['pictures'] ?? []) !== [],
            'text' => trim((string) ($d['wrap']['text'] ?? '')) !== '' || trim((string) ($d['wrap']['text_dv'] ?? '')) !== '' || trim((string) ($d['wrap']['text_heading'] ?? '')) !== '',
            'packed' => trim((string) ($d['packed_for'] ?? '')) !== '' || is_array($d['promo'] ?? null),
            default => false,
        };
    }

    // ---- Parts ----

    /** Logo, brand line and heading across the top; the name (lettering or typed) beneath, with the picture beside it when there is room. */
    private function brand(float $x, float $y, float $pw, float $ph): void
    {
        $d = $this->d;
        $k = $this->k;
        $brand = $d['brand'];
        $this->box($x, $y, $pw, $ph, StickerDesign::TINT, min(2.0, $ph * 0.08));
        $in = 1.2 * $k;
        // The logo at the left of the header row with the two lines beside it;
        // a narrow part puts the logo above them, everything centred.
        $logo = $brand['logo'] ?: $d['mark'];
        $narrow = $pw < 44.0;
        $hb = $narrow ? self::clamp($ph * 0.5, 9.0, 18.0) : self::clamp($ph * 0.4, 8.0, 15.0);
        $lw = 0.0;
        $lh = 0.0;
        if ($logo) {
            $ratio = $brand['logo'] ? $brand['logo_ratio'] : $d['mark_ratio'];
            [$lw, $lh] = $narrow ? StickerDesign::fit($ratio, $pw - 2 * $in, $hb * 0.42) : StickerDesign::fit($ratio, $hb * 1.3, $hb - 1.0);
            $this->img($narrow ? $x + ($pw - $lw) / 2 : $this->ax($x + $in, $lw, $pw, $x), $narrow ? $y + $in : $y + $in + ($hb - 1.0 - $lh) / 2, $lw, $lh, $logo);
        }
        $beside = !$narrow && $lw > 0 ? $lw + 1.2 : 0.0;
        $tx = $x + $in + $beside;
        $tw = $pw - 2 * $in - $beside;
        $align = $narrow ? 'c' : 'l';
        // Where the two lines' baselines sit: beside the logo, or under it.
        $ly = $narrow && $lh > 0 ? $y + $in + $lh + 0.4 : $y + $in;
        $lhb = $narrow && $lh > 0 ? $hb - $lh - 0.4 : $hb;
        if ($this->dv) {
            // Thaana sets small for its point size: a size or two up on the Latin lines.
            $pt = LabelText::fitPt($brand['name_dv'], 'dv', $tw, min(7.5 * $k, $lhb * 0.6), 3.6);
            $this->text($this->ax($tx, $tw, $pw, $x), $ly + $lhb * 0.4, $tw, $this->a($align), 'dv', $pt, StickerDesign::PRIMARY, $brand['name_dv'], 0.5);
            $pt = LabelText::fitPt($d['header_line_dv'], 'dv', $tw, min(10.5 * $k, $lhb * 0.85), 4.2);
            $this->text($this->ax($tx, $tw, $pw, $x), $ly + $lhb * 0.94, $tw, $this->a($align), 'dv', $pt, StickerDesign::DARK, $d['header_line_dv'], 0.6);
        } else {
            // The brand line letter-spaced, or plain when the spaced one cannot fit.
            $line = StickerDesign::spaced(mb_strtoupper($brand['name']));
            if (LabelText::widthMm($line, 2.8, 'j7') > $tw) {
                $line = mb_strtoupper($brand['name']);
            }
            $pt = LabelText::fitPt($line, 'j7', $tw, min(4.8 * $k, $lhb * 0.36), 2.8);
            $this->text($tx, $ly + $lhb * 0.34, $tw, $align, 'j7', $pt, StickerDesign::PRIMARY, $line);
            $pt = LabelText::fitPt($d['header_line'], 'j8', $tw, min(7.4 * $k, $lhb * 0.6), 3.6);
            $this->text($tx, $ly + $lhb * 0.84, $tw, $align, 'j8', $pt, StickerDesign::DARK, $d['header_line']);
        }
        $this->p[] = ['t' => 'rect', 'x' => $x + $in, 'y' => $y + $in + $hb + 0.3, 'w' => $pw - 2 * $in, 'h' => 0.3, 'fill' => StickerDesign::PRIMARY];

        // The name below, with the picture at its side when the part is wide enough.
        $ny = $y + $in + $hb + 1.4;
        $nh = $y + $ph - $in - $ny;
        $picW = 0.0;
        $photo = $d['photo'] ?: null;
        if ($photo && $pw >= 56 && $nh >= 10) {
            [$picW, $picH] = StickerDesign::fit($d['photo_ratio'], min($pw * 0.36, $nh * 1.3), $nh);
            $this->img($this->ax($x + $pw - $in - $picW, $picW, $pw, $x), $ny + ($nh - $picH) / 2, $picW, $picH, $photo);
            $picW += 1.2;
        }
        $nx = $x + $in;
        $nw = $pw - 2 * $in - $picW;
        $this->name($this->ax($nx, $nw, $pw, $x), $ny, $nw, $nh, $this->dv ? 'r' : ($picW > 0 ? 'l' : 'c'));
    }

    /** The product name: the hand lettering when there is some, else typed, English with Dhivehi beneath when both. */
    private function name(float $x, float $y, float $bw, float $nh, string $align): void
    {
        $d = $this->d;
        $useDv = $this->dv && $d['name_dv'] !== '';
        if ($d['title_img'] && !$useDv) {
            [$tw, $th] = StickerDesign::fit($d['title_ratio'], $bw, $nh);
            $tx = $align === 'c' ? $x + ($bw - $tw) / 2 : ($align === 'r' ? $x + $bw - $tw : $x);
            $this->img($tx, $y + ($nh - $th) / 2, $tw, $th, $d['title_img']);

            return;
        }
        $t = $useDv ? $d['name_dv'] : $d['name'];
        $font = $useDv ? 'dv' : 'dsi';
        $lineK = $this->lead($font, 1.0);
        $withDv = $this->both && $d['name_dv'] !== '';
        $enH = $withDv ? $nh * 0.6 : $nh;
        [$pt, $lines] = $this->fitLines($t, $font, $bw, $enH, min(16.0 * $this->k, 20.0), $useDv ? 6.0 : 5.5, 2);
        $lh = $lineK * $pt;
        $top = $y + max(0.0, ($enH - $lh * count($lines)) / 2);
        foreach ($lines as $i => $l) {
            $this->text($x, $top + $i * $lh + LabelText::ascent($font) * $pt * LabelText::PT, $bw, $align, $font, $pt, StickerDesign::PRIMARY, $l, $useDv ? 0.7 : 0.0);
        }
        if ($withDv) {
            $dvH = $nh - $enH;
            $dpt = LabelText::fitPt($d['name_dv'], 'dv', $bw, min(10.0 * $this->k, $dvH / $this->lead('dv', 1.0)), 4.5);
            $this->text($x, $y + $enH + max(0.0, ($dvH - $this->lead('dv', $dpt)) / 2) + LabelText::ascent('dv') * $dpt * LabelText::PT, $bw, $align, 'dv', $dpt, StickerDesign::PRIMARY, $d['name_dv'], 0.6);
        }
    }

    /** Ingredients (allergens bold), the note, storage, how to use, use-within and who made it, as far down as the part reaches. */
    private function legal(float $x, float $y, float $pw, float $ph): void
    {
        $d = $this->d;
        $k = $this->k;
        $pt = self::clamp(4.3 * $k, 3.4, 5.4);
        $headPt = self::clamp(4.0 * $k, 3.2, 4.8);
        $dvPt = self::clamp(5.4 * $k, 4.4, 6.6);
        $cursor = $y + 0.2;
        $bottom = $y + $ph;
        $a = $this->a('l');

        // A block of wrapped lines in one font; drawn only when it fits whole, or at least two lines of it.
        $block = function (string $text, string $font, float $size, string $colour, float $boldDv = 0.0, array $boldWords = [], bool $cut = true) use (&$cursor, $bottom, $pw, $x, $a): bool {
            $text = trim($text);
            if ($text === '') {
                return false;
            }
            $lead = $this->lead($font, $size);
            $lines = LabelText::wrap($text, $size, $pw, $font);
            $room = (int) floor(($bottom - $cursor + 0.05) / $lead);
            if ($room < 1) {
                return false;
            }
            if (count($lines) > $room) {
                if (!$cut) {
                    return false;
                }
                $lines = array_slice($lines, 0, $room);
                $last = rtrim((string) array_pop($lines), ' ,،');
                while ($last !== '' && LabelText::widthMm($last . '…', $size, $font) > $pw) {
                    $last = rtrim(mb_substr($last, 0, -1), ' ,،');
                }
                $lines[] = $last . '…';
            }
            foreach ($lines as $i => $l) {
                $this->text($x, $cursor + $i * $lead + LabelText::ascent($font) * $size * LabelText::PT, $pw, $a, $font, $size, $colour, $l, $boldDv, $boldWords);
            }
            $cursor += count($lines) * $lead + 0.35;

            return true;
        };

        // Ingredients: a Dhivehi label with no Dhivehi list prints the English one under the Dhivehi heading.
        $ingEn = (string) $d['ingredients_en'];
        $ingDv = (string) $d['ingredients_dv'];
        if ($ingEn !== '' || $ingDv !== '') {
            $this->dv
                ? $block('ހިމެނޭ ތަކެތި', 'dv', $dvPt, StickerDesign::PRIMARY, 0.5)
                : $block(StickerDesign::spaced('INGREDIENTS'), 'j7', $headPt, StickerDesign::PRIMARY);
            $listDv = $this->dv ? $ingDv !== '' : $ingEn === '';
            $listDv
                ? $block($ingDv, 'dv', $dvPt, StickerDesign::TEXT, 0.4)
                : $block($ingEn, 'j4', $pt, StickerDesign::TEXT, 0.0, $d['allergens'] ?? []);
            if ($this->both && !$listDv && $ingDv !== '') {
                $block($ingDv, 'dv', $dvPt, StickerDesign::TEXT, 0.4);
            }
        }
        // The note ("Contains …" when nothing else is typed), storage, how to use, use-within.
        $note = $this->dv ? (string) $d['note_dv'] : (string) $d['note'];
        if ($note !== '') {
            $block($note, $this->dv ? 'dv' : 'j7', $this->dv ? $dvPt : $pt, StickerDesign::PRIMARY, 0.5, [], false);
        }
        $storage = $this->dv ? (string) $d['storage_dv'] : (string) $d['storage_en'];
        if ($storage !== '') {
            $block($storage, $this->dv ? 'dv' : 'j7', $this->dv ? $dvPt : $pt, StickerDesign::DARK, 0.5, [], false);
        }
        $how = $this->dv ? (string) $d['how_to_use_dv'] : (string) $d['how_to_use'];
        if ($how !== '') {
            $block(($this->dv ? '' : 'How to use: ') . $how, $this->dv ? 'dv' : 'j4', $this->dv ? $dvPt : $pt, StickerDesign::TEXT, 0.4, [], false);
        }
        $within = $this->dv ? (string) ($d['use_within_dv'] ?? '') : (string) ($d['use_within'] ?? '');
        if ($within !== '') {
            $block($within, $this->dv ? 'dv' : 'j7', $this->dv ? $dvPt : $pt, StickerDesign::PRIMARY, 0.5, [], false);
        }
        // Who made it, under a hairline, when there is room for it.
        $maker = $this->producerLine();
        if ($maker !== '' && $bottom - $cursor >= $this->lead('j4', $pt) + 0.8) {
            $this->p[] = ['t' => 'line', 'x' => $x, 'y' => round($cursor + 0.2, 3), 'w' => $pw, 'color' => StickerDesign::BORDER, 'sw' => 0.2];
            $cursor += 0.7;
            $block($maker, 'j4', max(3.2, $pt - 0.4), StickerDesign::MUTED);
        }
    }

    /** "Made by Bake & Grill, Kalaafaanu Hingun, Malé · +960 912 0011 · bakeandgrill.mv". */
    private function producerLine(): string
    {
        $p = $this->d['producer'] ?? [];
        $who = trim((string) ($p['name'] ?? ''));
        if ($who === '') {
            return '';
        }
        $bits = array_filter([trim((string) ($p['address'] ?? '')), trim((string) ($p['phone'] ?? '')), trim((string) ($p['website'] ?? ''))], fn (string $s) => $s !== '');

        return 'Made by ' . $who . ($bits !== [] ? ', ' . implode(' · ', $bits) : '');
    }

    /** "NUTRITION PER 100 g" and every value as a row, or a custom label's typed line. */
    private function nutrition(float $x, float $y, float $pw, float $ph): void
    {
        $n = $this->d['nutrition'];
        $k = $this->k;
        $headPt = self::clamp(4.0 * $k, 3.2, 4.8);
        $pt = self::clamp(4.2 * $k, 3.3, 5.2);
        $a = $this->a('l');
        // The heading letter-spaced when the part is wide enough, else plain, else just "PER 100 g".
        $per = (string) ($n['per'] ?? 'g');
        $heading = StickerDesign::spaced('NUTRITION PER 100 ' . $per);
        if (LabelText::widthMm($heading, $headPt * 0.85, 'j7') > $pw) {
            $heading = 'NUTRITION PER 100 ' . $per;
            if (LabelText::widthMm($heading, $headPt * 0.85, 'j7') > $pw) {
                $heading = 'PER 100 ' . $per;
            }
        }
        $hpt = LabelText::fitPt($heading, 'j7', $pw, $headPt, 2.8);
        $cursor = $y + 0.2;
        $this->text($x, $cursor + LabelText::ascent('j7') * $hpt * LabelText::PT, $pw, $a, 'j7', $hpt, StickerDesign::PRIMARY, $heading);
        $cursor += $this->lead('j7', $hpt) + 0.6;
        $this->p[] = ['t' => 'line', 'x' => $x, 'y' => round($cursor - 0.3, 3), 'w' => $pw, 'color' => StickerDesign::BORDER, 'sw' => 0.2];
        $rows = $n['all'] ?? [];
        if ($rows === []) {
            $line = (string) ($n['line'] ?? '');
            $lead = $this->lead('j5', $pt);
            foreach (array_slice(LabelText::wrap($line, $pt, $pw, 'j5'), 0, max(1, (int) floor(($y + $ph - $cursor) / $lead))) as $i => $l) {
                $this->text($x, $cursor + $i * $lead + LabelText::ascent('j5') * $pt * LabelText::PT, $pw, $a, 'j5', $pt, StickerDesign::TEXT, $l);
            }

            return;
        }
        // Rows: the value right-aligned, the name on the left; "of which …" rows a touch smaller.
        $lead = min($this->lead('j5', $pt) * 1.05, max(1.0, ($y + $ph - $cursor) / count($rows)));
        $rowPt = min($pt, $lead / ($this->lead('j5', 1.0) * 1.05));
        foreach ($rows as $i => [$label, $value]) {
            $base = $cursor + $i * $lead + LabelText::ascent('j5') * $rowPt * LabelText::PT;
            if ($base > $y + $ph + 0.01) {
                break;
            }
            $sub = str_starts_with($label, 'of which');
            $vw = LabelText::widthMm($value, $rowPt, 'j7') + 0.4;
            $lf = $sub ? 'j4' : 'j5';
            $lpt = $sub ? $rowPt * 0.92 : $rowPt;
            $this->text($this->dv ? $x + $vw : $x + ($sub ? 1.2 : 0.0), $base, $pw - $vw - ($sub ? 1.2 : 0.0), $a, $lf, $lpt, $sub ? StickerDesign::MUTED : StickerDesign::TEXT, $label);
            $this->text($this->dv ? $x : $x + $pw - $vw, $base, $vw, $this->dv ? 'l' : 'r', 'j7', $rowPt, StickerDesign::TEXT, $value);
        }
    }

    /** The two date boxes, the batch and pack line, price and quantity, and the barcode when the part has the height. */
    private function dates(float $x, float $y, float $pw, float $ph): void
    {
        $d = $this->d;
        $k = $this->k;
        $line = self::clamp(2.6 * $k, 2.3, 3.4);
        $side = $pw >= 40.0;
        $bh = self::clamp($ph * ($side ? 0.42 : 0.3), 6.5, 11.0);
        $boxesH = $side ? $bh : 2 * $bh + 0.8;
        $rows = $this->dv
            ? [['ހެދި ތާރީޚު', 'ހެދި', StickerDesign::DARK, $d['mfg']], ['ހަމަވާ ތާރީޚު', 'ހަމަވާ', StickerDesign::PRIMARY, $d['exp']]]
            : [[$d['mfg_label'], $d['mfg_label'], StickerDesign::DARK, $d['mfg']], [$d['exp_label'], $d['exp_label'], StickerDesign::PRIMARY, $d['exp']]];
        $g = $side ? 1.4 : 0.8;
        $boxW = $side ? ($pw - $g) / 2 : $pw;
        foreach ($rows as $i => [$long, $short, $colour, $date]) {
            $bx = $side ? $x + $i * ($boxW + $g) : $x;
            $by = $side ? $y : $y + $i * ($bh + $g);
            $this->dateBox($bx, $by, $boxW, $bh, $long, $short, $colour, $date);
        }
        $cursor = $y + $boxesH + 0.6 * $k;

        // The batch (and the pack number), then the price, quantity and net weight.
        $pack = !empty($d['pack_of']) ? ' · ' . ($this->dv ? '' : 'PACK ') . $d['pack_no'] . '/' . $d['pack_of'] : '';
        $batch = $this->dv ? 'ބެޗް: ' . ($d['batch'] !== '' ? $d['batch'] : '..........') . $pack : 'BATCH: ' . ($d['batch'] !== '' ? $d['batch'] : '________') . $pack;
        $qty = $this->dv ? 'އަދަދު: ' . ($d['qty'] !== '' ? $d['qty'] : '......') : 'QTY: ' . ($d['qty'] !== '' ? $d['qty'] : '____') . ' ' . $d['unit'];
        $bits = array_filter([$d['price'] !== '' ? $d['price'] : null, $qty, $d['net_weight'] !== '' ? $d['net_weight'] : null]);
        $font = $this->dv ? 'dv' : 'j5';
        foreach ([$batch, implode(' · ', $bits)] as $t) {
            if ($cursor + $line > $y + $ph) {
                return;
            }
            $pt = LabelText::fitPt($t, $font, $pw, $this->dv ? $line * 1.8 : $line * 1.45, 3.0);
            $this->text($x, $this->baseCentred($cursor, $line, $font, $pt), $pw, $this->a('l'), $font, $pt, StickerDesign::TEXT, $t, $this->dv ? 0.5 : 0.0);
            $cursor += $line + 0.2;
        }
        // The barcode in what is left, when no Barcode part prints it and there is the height.
        if (!empty($d['barcode']) && !in_array('barcode', $this->parts, true) && $y + $ph - $cursor >= 8.0) {
            $this->ean($x, $cursor + 0.2, $pw, $y + $ph - $cursor - 0.2);
        }
    }

    /** The EAN barcode on its own: the bars as wide as the part allows, the digits beneath. */
    private function barcode(float $x, float $y, float $pw, float $ph): void
    {
        $this->ean($x, $y, $pw, $ph);
    }

    /** Bars and digits inside a box, centred, the bars no taller than three quarters of their width. */
    private function ean(float $x, float $y, float $bw, float $bh): void
    {
        $d = $this->d;
        $digitsPt = self::clamp(3.4 * $this->k, 2.8, 4.2);
        $digitsH = $this->lead('j5', $digitsPt) + 0.4;
        $barW = min($bw, 38.0);
        $barH = min(($bh - $digitsH) * 0.96, $barW * 0.75, 26.0);
        if ($barH < 5.0) {
            return;
        }
        $bx = $x + ($bw - $barW) / 2;
        $by = $y + max(0.0, ($bh - $barH - $digitsH) / 2);
        $this->img($bx, $by, $barW, $barH, $d['barcode']);
        $this->text($bx, $by + $barH + 0.4 + LabelText::ascent('j5') * $digitsPt * LabelText::PT, $barW, 'c', 'j5', $digitsPt, StickerDesign::TEXT, $d['barcode_text']);
    }

    private function dateBox(float $x, float $y, float $bw, float $bh, string $long, string $short, string $colour, ?string $date): void
    {
        $strip = round(max(2.0, $bh * 0.38), 2);
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

    /** The pack's QR (the batch page) when the sheet has one, else the complaints QR, with a caption. */
    private function qr(float $x, float $y, float $pw, float $ph): void
    {
        $d = $this->d;
        $src = !empty($d['batch_qr']) ? $d['batch_qr'] : $d['qr'];
        $capPt = self::clamp(3.0 * $this->k, 2.6, 3.6);
        $capH = $this->lead('j7', $capPt);
        $side = min($pw, $ph - $capH - 0.6);
        $qx = $x + ($pw - $side) / 2;
        $qy = $y + max(0.0, ($ph - $capH - 0.6 - $side) / 2);
        $this->p[] = ['t' => 'rect', 'x' => $qx - 0.4, 'y' => $qy - 0.4, 'w' => $side + 0.8, 'h' => $side + 0.8, 'fill' => StickerDesign::CREAM, 'r' => 0.6];
        $this->img($qx, $qy, $side, $side, $src);
        // The caption may hang a millimetre past the part each side; a squeezed part takes the short one.
        $cw = $pw + 2.0;
        $captions = !empty($d['batch_qr']) ? ['SCAN FOR PACK INFO', 'PACK INFO'] : ['FEEDBACK & COMPLAINTS', 'FEEDBACK'];
        $caption = LabelText::widthMm($captions[0], 2.4, 'j7') <= $cw - 1.0 ? $captions[0] : $captions[1];
        $this->text($x - 1.0, $qy + $side + 0.6 + LabelText::ascent('j7') * $capPt * LabelText::PT, $cw, 'c', 'j7', LabelText::fitPt($caption, 'j7', $cw, $capPt, 2.4), StickerDesign::MUTED, $caption);
    }

    /**
     * How the marks and pictures sit: one cell each with its caption beneath,
     * in one row, or two rows from three cells up when the part is tall
     * enough for them.
     *
     * @return array{n: int, rows: int, cols: int, cell: float, capPt: float, capH: float}
     */
    private function marksGrid(float $ph): array
    {
        $n = count($this->d['marks'] ?? []) + count($this->d['pictures'] ?? []);
        $capPt = self::clamp(2.9 * $this->k, 2.5, 3.4);
        $capH = $this->lead('j7', $capPt) + 0.3;
        $cell = self::clamp($ph * 0.36, 5.5, 10.0);
        $rows = $n >= 3 && $ph >= 2 * (5.5 + $capH) + 0.6 ? 2 : 1;
        $cols = (int) ceil($n / $rows);
        $cell = min($cell, ($ph - ($rows - 1) * 0.6) / $rows - $capH);

        return ['n' => $n, 'rows' => $rows, 'cols' => $cols, 'cell' => $cell, 'capPt' => $capPt, 'capH' => $capH];
    }

    /** The width the marks ask for: their cells a millimetre apart. */
    private function marksWidth(float $ph): float
    {
        $g = $this->marksGrid($ph);

        return $g['n'] === 0 ? 0.0 : $g['cols'] * $g['cell'] + ($g['cols'] - 1) * 1.0;
    }

    /** Recycling marks (glyphs of the symbol font, the tidy man drawn) and the pictures, each with its caption. */
    private function marks(float $x, float $y, float $pw, float $ph): void
    {
        $d = $this->d;
        $cells = [];
        foreach ($d['marks'] ?? [] as $m) {
            $cells[] = ['glyph' => $m['glyph'], 'caption' => $m['caption'], 'key' => $m['key'], 'src' => null];
        }
        foreach ($d['pictures'] ?? [] as $pic) {
            $cells[] = ['glyph' => '', 'caption' => '', 'key' => 'picture', 'src' => $pic['src'], 'ratio' => $pic['ratio']];
        }
        $n = count($cells);
        if ($n === 0) {
            return;
        }
        // The grid the width was shared for, its cells shrunk to the width the part got.
        ['rows' => $rows, 'cols' => $cols, 'cell' => $cell, 'capPt' => $capPt, 'capH' => $capH] = $this->marksGrid($ph);
        $cell = min($cell, ($pw - ($cols - 1) * 1.0) / $cols);
        $rowH = $cell + $capH;
        $top = $y + max(0.0, ($ph - $rows * $rowH - ($rows - 1) * 0.6) / 2);
        foreach ($cells as $i => $c) {
            $r = intdiv($i, $cols);
            $col = $i % $cols;
            $inRow = min($cols, $n - $r * $cols);
            $rowW = $inRow * $cell + ($inRow - 1) * 1.0;
            $cx = $x + ($pw - $rowW) / 2 + $col * ($cell + 1.0);
            $cy = $top + $r * ($rowH + 0.6);
            if ($c['src'] !== null) {
                [$iw, $ih] = StickerDesign::fit((float) $c['ratio'], $cell, $cell);
                $this->img($cx + ($cell - $iw) / 2, $cy + ($cell - $ih) / 2, $iw, $ih, $c['src']);
            } elseif ($c['glyph'] !== '') {
                // The symbol font's glyphs stand about 0.8 em tall on the baseline.
                $pt = $cell * 0.92 / (0.8 * LabelText::PT);
                $this->text($cx - 1.0, $cy + $cell * 0.9, $cell + 2.0, 'c', 'sym', $pt, StickerDesign::DARK, $c['glyph']);
            } else {
                $this->tidyMan($cx, $cy, $cell);
            }
            if ($c['caption'] !== '') {
                $cw = $cell + 1.0;
                $this->text($cx - 0.5, $cy + $cell + 0.3 + LabelText::ascent('j7') * $capPt * LabelText::PT, $cw, 'c', 'j7', LabelText::fitPt($c['caption'], 'j7', $cw, $capPt, 2.2), StickerDesign::MUTED, $c['caption']);
            }
        }
    }

    /** The tidy man: a figure dropping something into a bin, from a few boxes. */
    private function tidyMan(float $x, float $y, float $s): void
    {
        $ink = StickerDesign::DARK;
        $u = $s / 24.0;
        $box = fn (float $bx, float $by, float $bw, float $bh, float $r = 0.0) => $this->p[] = ['t' => 'rect', 'x' => round($x + $bx * $u, 3), 'y' => round($y + $by * $u, 3), 'w' => round($bw * $u, 3), 'h' => round($bh * $u, 3), 'fill' => $ink, 'r' => round($r * $u, 3)];
        $box(5.0, 2.0, 4.6, 4.6, 2.3);      // head
        $box(5.6, 7.0, 3.4, 8.0, 1.2);      // body
        $box(8.6, 8.2, 6.0, 1.6, 0.8);      // arm out to the bin
        $box(14.4, 6.2, 2.2, 2.2, 1.1);     // what is dropped
        $box(4.6, 15.0, 2.0, 6.6, 0.8);     // legs
        $box(8.0, 15.0, 2.0, 6.6, 0.8);
        $box(13.0, 10.6, 8.6, 1.4, 0.4);    // bin lid
        $box(14.0, 12.4, 6.6, 9.2, 0.8);    // bin
    }

    /** A heading and lines of the owner's own, English and Dhivehi. */
    private function freeText(float $x, float $y, float $pw, float $ph): void
    {
        $w = $this->d['wrap'];
        $k = $this->k;
        $pt = self::clamp(4.3 * $k, 3.4, 5.4);
        $dvPt = self::clamp(5.4 * $k, 4.4, 6.6);
        $headPt = self::clamp(4.2 * $k, 3.3, 5.0);
        $cursor = $y + 0.2;
        $bottom = $y + $ph;
        $a = $this->a('l');
        $put = function (string $text, string $font, float $size, string $colour, float $bold = 0.0) use (&$cursor, $bottom, $x, $pw, $a): void {
            $text = trim($text);
            if ($text === '') {
                return;
            }
            $lead = $this->lead($font, $size);
            foreach (LabelText::wrap($text, $size, $pw, $font) as $l) {
                if ($cursor + $lead > $bottom + 0.05) {
                    return;
                }
                $this->text($x, $cursor + LabelText::ascent($font) * $size * LabelText::PT, $pw, $a, $font, $size, $colour, $l, $bold);
                $cursor += $lead;
            }
            $cursor += 0.4;
        };
        $headEn = (string) $w['text_heading'];
        $headDv = (string) $w['text_heading_dv'];
        $bodyEn = (string) $w['text'];
        $bodyDv = (string) $w['text_dv'];
        if ($this->dv) {
            $put($headDv !== '' ? $headDv : $headEn, $headDv !== '' ? 'dv' : 'j7', $headDv !== '' ? $dvPt : $headPt, StickerDesign::PRIMARY, 0.5);
            $put($bodyDv !== '' ? $bodyDv : $bodyEn, $bodyDv !== '' ? 'dv' : 'j4', $bodyDv !== '' ? $dvPt : $pt, StickerDesign::TEXT, 0.4);

            return;
        }
        $put(mb_strtoupper($headEn), 'j7', $headPt, StickerDesign::PRIMARY);
        if ($this->both && $headDv !== '') {
            $put($headDv, 'dv', $dvPt, StickerDesign::PRIMARY, 0.5);
        }
        $put($bodyEn, 'j4', $pt, StickerDesign::TEXT);
        if ($this->both && $bodyDv !== '') {
            $put($bodyDv, 'dv', $dvPt, StickerDesign::TEXT, 0.4);
        }
    }

    /** The packed-for box and the promotion flash. */
    private function packed(float $x, float $y, float $pw, float $ph): void
    {
        $d = $this->d;
        $k = $this->k;
        $cursor = $y;
        $for = trim((string) ($d['packed_for'] ?? ''));
        if ($for !== '') {
            $second = trim((string) ($d['packed_for2'] ?? ''));
            $boxH = self::clamp($ph * ($second !== '' ? 0.5 : 0.38), 8.0, 16.0);
            $this->box($x, $cursor, $pw, $boxH, StickerDesign::TINT, 1.2, StickerDesign::PRIMARY, 0.3);
            $eyebrowPt = self::clamp(3.6 * $k, 2.8, 4.4);
            $this->text($x + 1.0, $cursor + 0.8 + LabelText::ascent('j7') * $eyebrowPt * LabelText::PT, $pw - 2.0, $this->a('l'), 'j7', $eyebrowPt, StickerDesign::PRIMARY, 'PACKED FOR', 0.0, [], 0.06);
            $namePt = LabelText::fitPt($for, 'j8', $pw - 2.0, self::clamp(7.0 * $k, 5.0, 8.5), 4.0);
            $ny = $cursor + 0.8 + $this->lead('j7', $eyebrowPt) + 0.2;
            $this->text($x + 1.0, $ny + LabelText::ascent('j8') * $namePt * LabelText::PT, $pw - 2.0, $this->a('l'), 'j8', $namePt, StickerDesign::DARK, $for);
            if ($second !== '') {
                $spt = LabelText::fitPt($second, 'j5', $pw - 2.0, self::clamp(4.6 * $k, 3.4, 5.4), 3.0);
                $this->text($x + 1.0, $ny + $this->lead('j8', $namePt) + LabelText::ascent('j5') * $spt * LabelText::PT, $pw - 2.0, $this->a('l'), 'j5', $spt, StickerDesign::TEXT, $second);
            }
            $cursor += $boxH + 1.0;
        }
        if (is_array($d['promo'] ?? null) && $y + $ph - $cursor >= 7.0) {
            $fh = min(self::clamp($ph * 0.34, 8.0, 14.0), $y + $ph - $cursor);
            $fw = min($pw, $fh * 2.4);
            foreach (StickerDesign::flash($d['promo'], $this->dv ? $x + $pw - $fw : $x, $cursor, $fw, $fh) as $piece) {
                $this->p[] = $piece;
            }
        }
    }

    /** The flavour band along the bottom: the flavour or name in English and Dhivehi, the net content at the end. */
    private function band(float $x, float $y, float $bw, float $bh): void
    {
        $d = $this->d;
        $w = $d['wrap'];
        $this->box($x, $y, $bw, $bh, StickerDesign::PRIMARY, min(1.6, $bh * 0.2));
        $en = trim((string) $w['band_text']) !== '' ? (string) $w['band_text'] : (string) $d['name'];
        $dv = trim((string) $w['band_text_dv']) !== '' ? (string) $w['band_text_dv'] : (string) $d['name_dv'];
        $net = trim((string) $d['net_weight']);
        $in = 1.6;
        $netPt = min(7.0 * $this->k, $bh * 0.66);
        $netW = $net !== '' ? LabelText::widthMm($net, $netPt, 'j7') + 2.0 : 0.0;
        $tw = $bw - 2 * $in - $netW;
        $maxPt = min(9.0 * $this->k, $bh * 0.78);
        if ($this->dv && $dv !== '') {
            $pt = LabelText::fitPt($dv, 'dv', $tw, $maxPt * 1.35, 4.0);
            $this->text($x + $in + $netW, $this->baseCentred($y, $bh, 'dv', $pt), $tw, 'r', 'dv', $pt, StickerDesign::CREAM, $dv, 0.6);
        } elseif ($this->both && $dv !== '') {
            // English first, the Dhivehi right after it, the way a bottle lists its languages in a row.
            $pt = LabelText::fitPt(mb_strtoupper($en), 'j8', $tw * 0.58, $maxPt, 4.0);
            $this->text($x + $in, $this->baseCentred($y, $bh, 'j8', $pt), $tw * 0.58, 'l', 'j8', $pt, StickerDesign::CREAM, mb_strtoupper($en), 0.0, [], 0.03);
            $ew = LabelText::widthMm(mb_strtoupper($en), $pt, 'j8') * 1.03 + 4.0;
            $dw = $tw - $ew;
            $dpt = LabelText::fitPt($dv, 'dv', $dw, $maxPt * 1.35, 4.0);
            $this->text($x + $in + $ew, $this->baseCentred($y, $bh, 'dv', $dpt), $dw, 'l', 'dv', $dpt, StickerDesign::CREAM, $dv, 0.6);
        } else {
            $pt = LabelText::fitPt(mb_strtoupper($en), 'j8', $tw, $maxPt, 4.0);
            $this->text($x + $in, $this->baseCentred($y, $bh, 'j8', $pt), $tw, 'l', 'j8', $pt, StickerDesign::CREAM, mb_strtoupper($en), 0.0, [], 0.03);
        }
        if ($net !== '') {
            $this->text($this->dv ? $x + $in : $x + $bw - $in - $netW, $this->baseCentred($y, $bh, 'j7', $netPt), $netW, $this->dv ? 'l' : 'r', 'j7', $netPt, StickerDesign::CREAM, $net);
        }
    }

    // ---- Helpers ----

    /** Text alignment in reading order: left in English, right in Dhivehi. */
    private function a(string $align): string
    {
        return $this->dv ? ['l' => 'r', 'r' => 'l', 'c' => 'c'][$align] : $align;
    }

    /** A box's x mirrored to the far side of its part in Dhivehi. */
    private function ax(float $x, float $w, float $pw, float $px): float
    {
        return $this->dv ? $px + ($px + $pw - ($x + $w)) : $x;
    }

    /** The largest size from $maxPt down at which $text fits $w in at most $maxLines lines inside $h. */
    private function fitLines(string $text, string $font, float $w, float $h, float $maxPt, float $minPt, int $maxLines): array
    {
        $lineK = $this->lead($font, 1.0);
        $pt = LabelText::fitPt($text, $font, $w, min($maxPt, $h / $lineK), $minPt);
        if (LabelText::widthMm($text, $pt, $font) <= $w * 1.01) {
            return [$pt, [$text]];
        }
        for ($try = min($maxPt, $h / ($maxLines * $lineK)); $try >= $minPt - 0.01; $try -= 0.25) {
            $lines = LabelText::wrap($text, $try, $w, $font);
            if (count($lines) <= $maxLines) {
                return [round($try, 2), $lines];
            }
        }

        return [$minPt, array_slice(LabelText::wrap($text, $minPt, $w, $font), 0, $maxLines)];
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

    private function box(float $x, float $y, float $w, float $h, string $fill, float $r = 0.0, ?string $stroke = null, float $sw = 0.3): void
    {
        $piece = ['t' => 'rect', 'x' => round($x, 3), 'y' => round($y, 3), 'w' => round($w, 3), 'h' => round($h, 3), 'fill' => $fill, 'r' => round($r, 3)];
        if ($stroke !== null) {
            $piece['stroke'] = $stroke;
            $piece['sw'] = $sw;
        }
        $this->p[] = $piece;
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
