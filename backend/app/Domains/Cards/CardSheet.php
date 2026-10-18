<?php

declare(strict_types=1);

namespace App\Domains\Cards;

use App\Domains\Labels\LabelText;
use App\Support\QrSvg;
use App\Support\ThaanaVisual;

/**
 * Lays out printed cards (owner, 2026-10-18). Each face is a list of boxes in mm
 * (rect, img, text, qr) that `cards/sheet.blade.php` draws the same way for the browser
 * preview and for dompdf, so preview and print never differ.
 *
 * Two outputs, neither tied to a brand of printer:
 *  - `card`: every PDF page is one card face at the card's exact size, the shape every
 *    card printer's driver takes (Matica, Evolis, Zebra, Fargo, Magicard…), printed at
 *    actual size with the driver's card size set to match; backgrounds run to the edge.
 *  - `a4`: as many cards as fit on A4 with crop marks, for an office printer and a
 *    cutter; a back page mirrors its columns so a duplex sheet lines up.
 */
final class CardSheet
{
    public const OUTPUTS = ['card', 'a4'];

    /** front: fronts only; both: front then back of each card (a duplex printer); fronts_then_backs: every front, then every back (feed the stack again). */
    public const SIDES = ['front', 'both', 'fronts_then_backs'];

    private const A4 = [210.0, 297.0];

    private const A4_MARGIN = 7.0;

    /** Room between cards for a cutter's blade; the crop marks stand outside the grid. */
    private const A4_GAP = 3.0;

    /** @var array<string, string> */
    private array $qrCache = [];

    /**
     * @param array<string, mixed> $spec CardSpec::clean() output
     * @param array{entries: list<array<string, mixed>>} $run CardSource::resolve() output
     * @return array{page_w: float, page_h: float, pages: list<array{w: float, h: float, cards: list<array{x: float, y: float, w: float, h: float, boxes: list<array<string, mixed>>}>, marks: list<array<string, float>>}>, cards: int}
     */
    public function build(array $spec, array $run, string $output, string $sides, bool $forPdf, bool $one = false): array
    {
        $output = in_array($output, self::OUTPUTS, true) ? $output : 'card';
        $sides = in_array($sides, self::SIDES, true) ? $sides : 'front';
        if (!$spec['back']) {
            $sides = 'front';
        }
        [$cw, $ch] = CardSpec::page($spec);
        $entries = $one ? array_slice($run['entries'], 0, 1) : $run['entries'];

        $fronts = [];
        $backs = [];
        foreach ($entries as $entry) {
            $fronts[] = $this->front($spec, $entry, $cw, $ch, $forPdf);
            if ($sides !== 'front') {
                $backs[] = $this->back($spec, $entry, $cw, $ch, $forPdf);
            }
        }

        if ($one) {
            // The designer's preview: the front and, beside it, the back.
            $pages = [['w' => $cw, 'h' => $ch, 'cards' => [['x' => 0.0, 'y' => 0.0, 'w' => $cw, 'h' => $ch, 'boxes' => $fronts[0] ?? []]], 'marks' => []]];
            if ($spec['back']) {
                $pages[] = ['w' => $cw, 'h' => $ch, 'cards' => [['x' => 0.0, 'y' => 0.0, 'w' => $cw, 'h' => $ch, 'boxes' => $this->back($spec, $entries[0] ?? [], $cw, $ch, $forPdf)]], 'marks' => []];
            }

            return ['page_w' => $cw, 'page_h' => $ch, 'pages' => $pages, 'cards' => count($entries)];
        }

        if ($output === 'card') {
            $faces = [];
            if ($sides === 'both') {
                foreach ($fronts as $i => $f) {
                    $faces[] = $f;
                    $faces[] = $backs[$i];
                }
            } else {
                $faces = array_merge($fronts, $backs);
            }
            $pages = array_map(fn (array $boxes) => ['w' => $cw, 'h' => $ch, 'cards' => [['x' => 0.0, 'y' => 0.0, 'w' => $cw, 'h' => $ch, 'boxes' => $boxes]], 'marks' => []], $faces);

            return ['page_w' => $cw, 'page_h' => $ch, 'pages' => $pages, 'cards' => count($entries)];
        }

        [$cols, $rows] = self::grid($cw, $ch);
        $per = $cols * $rows;
        $pages = [];
        foreach (array_chunk(array_keys($fronts), $per) as $chunk) {
            $pages[] = $this->a4Page(array_map(fn ($i) => $fronts[$i], $chunk), $cw, $ch, $cols, $rows, false);
            if ($sides === 'both') {
                $pages[] = $this->a4Page(array_map(fn ($i) => $backs[$i], $chunk), $cw, $ch, $cols, $rows, true);
            }
        }
        if ($sides === 'fronts_then_backs') {
            foreach (array_chunk($backs, $per) as $chunk) {
                $pages[] = $this->a4Page($chunk, $cw, $ch, $cols, $rows, true);
            }
        }

        return ['page_w' => self::A4[0], 'page_h' => self::A4[1], 'pages' => $pages, 'cards' => count($entries)];
    }

    /** Cards across and down an A4 page. */
    public static function grid(float $cw, float $ch): array
    {
        $cols = max(1, (int) floor((self::A4[0] - 2 * self::A4_MARGIN + self::A4_GAP) / ($cw + self::A4_GAP)));
        $rows = max(1, (int) floor((self::A4[1] - 2 * self::A4_MARGIN + self::A4_GAP) / ($ch + self::A4_GAP)));

        return [$cols, $rows];
    }

    /** @param list<list<array<string, mixed>>> $faces */
    private function a4Page(array $faces, float $cw, float $ch, int $cols, int $rows, bool $mirror): array
    {
        $gridW = $cols * $cw + ($cols - 1) * self::A4_GAP;
        $gridH = $rows * $ch + ($rows - 1) * self::A4_GAP;
        $x0 = (self::A4[0] - $gridW) / 2;
        $y0 = (self::A4[1] - $gridH) / 2;
        $cards = [];
        $marks = [];
        foreach ($faces as $i => $boxes) {
            $col = $i % $cols;
            $row = intdiv($i, $cols);
            if ($mirror) {
                $col = $cols - 1 - $col;
            }
            $x = $x0 + $col * ($cw + self::A4_GAP);
            $y = $y0 + $row * ($ch + self::A4_GAP);
            $cards[] = ['x' => $x, 'y' => $y, 'w' => $cw, 'h' => $ch, 'boxes' => $boxes];
        }
        // Crop marks in the margin, in line with every card edge: ticks above and below the
        // grid for each column's edges, left and right of it for each row's.
        $len = 4.0;
        for ($c = 0; $c < $cols; $c++) {
            foreach ([$x0 + $c * ($cw + self::A4_GAP), $x0 + $c * ($cw + self::A4_GAP) + $cw] as $ex) {
                $marks[] = ['x' => $ex - 0.1, 'y' => $y0 - $len - 1, 'w' => 0.2, 'h' => $len];
                $marks[] = ['x' => $ex - 0.1, 'y' => $y0 + $gridH + 1, 'w' => 0.2, 'h' => $len];
            }
        }
        for ($r = 0; $r < $rows; $r++) {
            foreach ([$y0 + $r * ($ch + self::A4_GAP), $y0 + $r * ($ch + self::A4_GAP) + $ch] as $ey) {
                $marks[] = ['x' => $x0 - $len - 1, 'y' => $ey - 0.1, 'w' => $len, 'h' => 0.2];
                $marks[] = ['x' => $x0 + $gridW + 1, 'y' => $ey - 0.1, 'w' => $len, 'h' => 0.2];
            }
        }

        return ['w' => self::A4[0], 'h' => self::A4[1], 'cards' => $cards, 'marks' => $marks];
    }

    /** @return list<array<string, mixed>> */
    private function front(array $spec, array $entry, float $w, float $h, bool $forPdf): array
    {
        $portrait = $h > $w;
        $tpl = $spec['template'];
        [$bg, $ink, $soft, $chipBg, $chipInk] = CardSpec::ACCENTS[$spec['accent']];
        if ($tpl === 'minimal') {
            [$bg, $ink, $soft] = ['#F7F5F2', '#1C1408', '#6B5D4F'];
        }
        $photo = $tpl === 'photo' ? CardSpec::localImage((string) $spec['photo']) : null;
        if ($tpl === 'photo') {
            [$bg, $ink, $soft] = ['#1C1408', '#FFFDF9', '#E8E0D8'];
        }

        $b = [['t' => 'rect', 'x' => 0, 'y' => 0, 'w' => $w, 'h' => $h, 'fill' => $bg]];
        if ($photo !== null) {
            $b[] = ['t' => 'img', 'x' => 0, 'y' => 0, 'w' => $w, 'h' => $h, 'src' => CardImages::cover($photo, $w, $h)];
            $b[] = ['t' => 'rect', 'x' => 0, 'y' => 0, 'w' => $w, 'h' => $h, 'fill' => '#000000', 'opacity' => $spec['photo_dim'] / 100];
        }
        $accentHex = CardSpec::ACCENTS[$spec['accent']][0];
        if ($tpl === 'minimal') {
            $b[] = $portrait
                ? ['t' => 'rect', 'x' => 0, 'y' => 0, 'w' => $w, 'h' => 3.2, 'fill' => $accentHex === '#F7F5F2' ? '#B74B0C' : $accentHex]
                : ['t' => 'rect', 'x' => 0, 'y' => 0, 'w' => 3.2, 'h' => $h, 'fill' => $accentHex === '#F7F5F2' ? '#B74B0C' : $accentHex];
        }

        $m = 4.5;
        $left = $tpl === 'minimal' && !$portrait ? $m + 2.5 : $m;
        $dark = in_array(strtoupper($bg), ['#1C1408', '#B74B0C'], true) || $photo !== null;
        $qrMm = $spec['show_qr'] && $entry['qr'] !== null ? ($portrait ? min(24.0, $w * 0.42) : min(19.0, $h * 0.36)) : 0.0;

        $lang = $spec['lang'];
        $title = $this->pick($spec, 'title', $lang);
        // The headline is the typed one, else the card's value ("20% OFF", "MVR 500.00").
        // A stamp card with no value of its own says what the stamps earn.
        $value = (string) ($entry['value'] ?? '');
        if ($value === '' && $tpl === 'stamp' && $spec['stamps'] > 0) {
            $value = 'Every ' . self::ordinal((int) $spec['stamps']) . ' one free';
        }
        $headline = $this->pick(array_merge($spec, ['headline' => $spec['headline'] !== '' ? $spec['headline'] : $value]), 'headline', $lang);
        $note = $this->pick($spec, 'note', $lang);
        $headFont = $tpl === 'minimal' ? 'ds' : 'j8';

        if (!$portrait) {
            // Logo top left, title top right; headline across the middle; note, code and dates along the bottom; QR bottom right.
            $logoH = 11.0;
            if ($spec['show_logo']) {
                $b = array_merge($b, $this->logo($left, $m - 1.2, $logoH, $bg, $dark));
            }
            $tx = $left + ($spec['show_logo'] ? $logoH + 2 : 0);
            $b = array_merge($b, $this->textPair($title, $tx, $m, $w - $m - $tx, 7.5, 'j7', $soft, 'right', $forPdf, 2.6));

            $textW = $w - $left - $m - ($qrMm > 0 ? $qrMm + 3 : 0);
            $y = $h * 0.33;
            if ($headline[0] !== '') {
                $pt = LabelText::fitPt($headline[0], $headFont, $textW, 26, 11);
                $b[] = $this->text($headline[0], $left, $y, $textW, $pt, $headFont, $ink, 'left', $forPdf);
                $y += $pt * LabelText::PT * 1.4;
            }
            if ($headline[1] !== '') {
                $pt = LabelText::fitPt($headline[1], 'dv', $textW, 15, 8);
                $b[] = $this->text($headline[1], $left, $y, $textW, $pt, 'dv', $ink, 'right', $forPdf, true);
                $y += $pt * LabelText::PT * 1.35;
            }
            $b = array_merge($b, $this->noteLines($note, $left, $y + 0.6, $textW, $soft, $forPdf, $h - $m - 9.5));

            $by = $h - $m - 5.2;
            $bx = $left;
            if ($spec['show_code'] && $entry['code'] !== null) {
                $code = (string) $entry['code'];
                $pt = LabelText::fitPt($code, 'j7', 34, 8.5, 6);
                $cwMm = LabelText::widthMm($code, $pt, 'j7') + 4.4;
                $b[] = ['t' => 'rect', 'x' => $bx, 'y' => $by, 'w' => $cwMm, 'h' => 5.2, 'fill' => $chipBg, 'r' => 1.2];
                $b[] = $this->text($code, $bx + 2.2, $by + 0.95, $cwMm - 4.4, $pt, 'j7', $chipInk, 'left', $forPdf);
                $bx += $cwMm + 2;
            }
            $meta = $this->meta($spec, $entry);
            if ($meta !== '') {
                $mw = max(10, $w - $m - $bx - ($qrMm > 0 ? $qrMm + 2 : 0));
                $b[] = $this->text($meta, $bx, $by + 1.5, $mw, LabelText::fitPt($meta, 'j5', $mw, 5.6, 3.8), 'j5', $soft, 'left', $forPdf);
            }
            if ($qrMm > 0) {
                $b = array_merge($b, $this->qr((string) $entry['qr'], $w - $m - $qrMm, $h - $m - $qrMm, $qrMm));
            }

            return $b;
        }

        // Portrait: logo, title, headline and note centred down the card; QR and code below.
        $y = $m + 1;
        if ($spec['show_logo']) {
            $b = array_merge($b, $this->logo(($w - 15) / 2, $y, 15.0, $bg, $dark));
            $y += 16.5;
        }
        $inner = $w - 2 * $m;
        $b = array_merge($b, $this->textPair($title, $m, $y, $inner, 7.5, 'j7', $soft, 'center', $forPdf, 2.8));
        $y += 4.6 + ($title[1] !== '' ? 3.4 : 0);
        if ($headline[0] !== '') {
            $pt = LabelText::fitPt($headline[0], $headFont, $inner, 22, 10);
            $b[] = $this->text($headline[0], $m, $y, $inner, $pt, $headFont, $ink, 'center', $forPdf);
            $y += $pt * LabelText::PT * 1.4;
        }
        if ($headline[1] !== '') {
            $pt = LabelText::fitPt($headline[1], 'dv', $inner, 13, 8);
            $b[] = $this->text($headline[1], $m, $y, $inner, $pt, 'dv', $ink, 'center', $forPdf, true);
            $y += $pt * LabelText::PT * 1.35;
        }
        $bottom = $h - $m - ($qrMm > 0 ? $qrMm + 2 : 0) - ($spec['show_code'] && $entry['code'] !== null ? 7 : 0) - 3.5;
        $b = array_merge($b, $this->noteLines($note, $m, $y + 0.8, $inner, $soft, $forPdf, $bottom, 'center'));

        $yb = $h - $m;
        $meta = $this->meta($spec, $entry);
        if ($meta !== '') {
            $yb -= 3;
            $b[] = $this->text($meta, $m, $yb, $inner, 5.6, 'j5', $soft, 'center', $forPdf);
        }
        if ($spec['show_code'] && $entry['code'] !== null) {
            $code = (string) $entry['code'];
            $pt = LabelText::fitPt($code, 'j7', $inner - 4.4, 8.5, 6);
            $cwMm = LabelText::widthMm($code, $pt, 'j7') + 4.4;
            $yb -= 6.2;
            $b[] = ['t' => 'rect', 'x' => ($w - $cwMm) / 2, 'y' => $yb, 'w' => $cwMm, 'h' => 5.2, 'fill' => $chipBg, 'r' => 1.2];
            $b[] = $this->text($code, ($w - $cwMm) / 2 + 2.2, $yb + 0.95, $cwMm - 4.4, $pt, 'j7', $chipInk, 'left', $forPdf);
        }
        if ($qrMm > 0) {
            $b = array_merge($b, $this->qr((string) $entry['qr'], ($w - $qrMm) / 2, $yb - $qrMm - 2, $qrMm));
        }

        return $b;
    }

    /** @return list<array<string, mixed>> */
    private function back(array $spec, array $entry, float $w, float $h, bool $forPdf): array
    {
        $ink = '#1C1408';
        $soft = '#6B5D4F';
        $accent = CardSpec::RUST;
        $m = 4.5;
        $inner = $w - 2 * $m;
        $lang = $spec['lang'];
        $b = [
            ['t' => 'rect', 'x' => 0, 'y' => 0, 'w' => $w, 'h' => $h, 'fill' => '#F7F5F2'],
            ['t' => 'rect', 'x' => 0, 'y' => 0, 'w' => $w, 'h' => 1.6, 'fill' => $accent],
        ];

        $y = $m;
        $title = $this->pick($spec, 'back_title', $lang);
        if ($title[0] !== '' || $title[1] !== '') {
            $b = array_merge($b, $this->textPair($title, $m, $y, $inner, 8, 'j7', $ink, 'left', $forPdf, 3.4));
            $y += 4.6 + ($title[1] !== '' ? 3.6 : 0);
        }

        $contactH = $spec['back_contact'] ? 7.0 : 0.0;
        $bottom = $h - $m - $contactH;

        if ($spec['template'] === 'stamp' && $spec['stamps'] > 0) {
            $n = (int) $spec['stamps'];
            $perRow = (int) ceil($n / 2);
            $gap = 1.8;
            $d = min(($inner - ($perRow - 1) * $gap) / $perRow, ($bottom - $y - 6) / 2 - $gap);
            $gx = $m + ($inner - ($perRow * $d + ($perRow - 1) * $gap)) / 2;
            for ($i = 0; $i < $n; $i++) {
                $cx = $gx + ($i % $perRow) * ($d + $gap);
                $cy = $y + intdiv($i, $perRow) * ($d + $gap);
                $last = $i === $n - 1;
                $b[] = ['t' => 'rect', 'x' => $cx, 'y' => $cy, 'w' => $d, 'h' => $d, 'fill' => $last ? $accent : '#FFFDF9', 'r' => $d / 2, 'stroke' => $last ? $accent : '#9C8E7E'];
                $label = $last ? 'FREE' : (string) ($i + 1);
                $pt = $last ? LabelText::fitPt('FREE', 'j8', $d - 1.2, 7, 4) : min(7.0, $d * 0.9);
                $b[] = $this->text($label, $cx, $cy + ($d - $pt * LabelText::PT) / 2 - 0.3, $d, $pt, $last ? 'j8' : 'j5', $last ? '#FFFDF9' : '#9C8E7E', 'center', $forPdf);
            }
            $y += 2 * ($d + $gap) + 0.4;
            $reward = $this->pick($spec, 'stamp_reward', $lang);
            $b = array_merge($b, $this->textPair($reward, $m, $y, $inner, 6.6, 'j7', $ink, 'center', $forPdf, 2.8));
        } else {
            $lines = [];
            if ($lang !== 'dv' && $spec['back_text'] !== '') {
                foreach (explode("\n", $spec['back_text']) as $line) {
                    $lines[] = [$line, false];
                }
            }
            $dvText = $spec['back_text_dv'] !== '' ? $spec['back_text_dv'] : ($lang === 'dv' ? $spec['back_text'] : '');
            if ($lang !== 'en' && $dvText !== '') {
                foreach (explode("\n", $dvText) as $line) {
                    $lines[] = [$line, $spec['back_text_dv'] !== ''];
                }
            }
            foreach ($lines as [$line, $isDv]) {
                $pt = 5.8;
                foreach (LabelText::wrap($line, $pt, $inner, $isDv ? 'dv' : 'j4') as $row) {
                    $lh = $pt * LabelText::PT * ($isDv ? 1.6 : 1.35);
                    if ($y + $lh > $bottom) {
                        break 2;
                    }
                    $b[] = $this->text($row, $m, $y, $inner, $pt, $isDv ? 'dv' : 'j4', $soft, $isDv ? 'right' : 'left', $forPdf, $isDv);
                    $y += $lh;
                }
                $y += 0.6;
            }
        }

        if ($spec['back_contact']) {
            $parts = array_values(array_filter([
                trim((string) content('business_phone', '')),
                preg_replace('#^https?://#', '', rtrim(trim((string) content('business_website', '')), '/')),
                trim((string) content('business_address', '')),
            ], fn ($p) => is_string($p) && $p !== ''));
            $b[] = ['t' => 'rect', 'x' => $m, 'y' => $h - $m - 5.6, 'w' => $inner, 'h' => 0.25, 'fill' => '#E8E0D8'];
            $line = implode('  ·  ', $parts);
            if ($line !== '') {
                $pt = LabelText::fitPt($line, 'j5', $inner - ($spec['show_number'] ? 14 : 0), 6, 4.2);
                $b[] = $this->text($line, $m, $h - $m - 3.6, $inner, $pt, 'j5', $ink, 'left', $forPdf);
            }
        }
        if ($spec['show_number'] && ($entry['of'] ?? 1) > 1) {
            $b[] = $this->text('No. ' . $entry['number'], $m, $h - $m - 3.6, $inner, 5.4, 'j5', $soft, 'right', $forPdf);
        }

        return $b;
    }

    private static function ordinal(int $n): string
    {
        $suffix = in_array($n % 100, [11, 12, 13], true) ? 'th' : (['th', 'st', 'nd', 'rd'][$n % 10] ?? 'th');

        return $n . $suffix;
    }

    /** Expiry and card number, as one small line. */
    private function meta(array $spec, array $entry): string
    {
        $parts = [];
        if ($spec['show_expiry'] && ($entry['expiry'] ?? null) !== null) {
            $parts[] = 'Valid until ' . $entry['expiry']->format('j M Y');
        }
        if ($spec['show_number'] && ($entry['of'] ?? 1) > 1) {
            $parts[] = 'No. ' . $entry['number'] . ' of ' . $entry['of'];
        }

        return implode('  ·  ', $parts);
    }

    /** [English, Dhivehi] for a field in the card's language; Dhivehi is '' unless typed. */
    private function pick(array $spec, string $key, string $lang): array
    {
        $en = (string) ($spec[$key] ?? '');
        $dv = (string) ($spec[$key . '_dv'] ?? '');

        return match ($lang) {
            'dv' => $dv !== '' ? ['', $dv] : [$en, ''],
            'both' => [$en, $dv],
            default => [$en, ''],
        };
    }

    /** @return list<array<string, mixed>> */
    private function textPair(array $pair, float $x, float $y, float $w, float $pt, string $font, string $color, string $align, bool $forPdf, float $dvGap): array
    {
        $out = [];
        if ($pair[0] !== '') {
            $out[] = $this->text($pair[0], $x, $y, $w, LabelText::fitPt($pair[0], $font, $w, $pt, 4.5), $font, $color, $align, $forPdf);
        }
        if ($pair[1] !== '') {
            $out[] = $this->text($pair[1], $x, $y + ($pair[0] !== '' ? $dvGap + 0.6 : 0), $w, LabelText::fitPt($pair[1], 'dv', $w, $pt, 4.5), 'dv', $color, $align === 'left' ? 'right' : $align, $forPdf, true);
        }

        return $out;
    }

    /** @return list<array<string, mixed>> */
    private function noteLines(array $note, float $x, float $y, float $w, string $color, bool $forPdf, float $maxY, string $align = 'left'): array
    {
        $out = [];
        foreach ([[$note[0], false], [$note[1], true]] as [$text, $isDv]) {
            if ($text === '') {
                continue;
            }
            $pt = 6.2;
            foreach (array_slice(LabelText::wrap($text, $pt, $w, $isDv ? 'dv' : 'j5'), 0, 2) as $row) {
                $lh = $pt * LabelText::PT * ($isDv ? 1.6 : 1.3);
                if ($y + $lh > $maxY) {
                    return $out;
                }
                $out[] = $this->text($row, $x, $y, $w, $pt, $isDv ? 'dv' : 'j5', $color, $isDv && $align === 'left' ? 'right' : $align, $forPdf, $isDv);
                $y += $lh;
            }
        }

        return $out;
    }

    private function text(string $text, float $x, float $y, float $w, float $pt, string $font, string $color, string $align, bool $forPdf, bool $dv = false): array
    {
        if ($dv || ThaanaVisual::hasThaana($text)) {
            $font = 'dv';
            $text = $forPdf ? ThaanaVisual::order($text, LabelText::dvFace()['composed']) : $text;
        }

        return ['t' => 'text', 'x' => $x, 'y' => $y, 'w' => $w, 'text' => $text, 'pt' => round($pt, 2), 'font' => $font, 'color' => $color, 'align' => $align, 'rtl' => $font === 'dv' && !$forPdf];
    }

    /** @return list<array<string, mixed>> */
    private function qr(string $url, float $x, float $y, float $mm): array
    {
        $this->qrCache[$url] ??= 'data:image/svg+xml;base64,' . base64_encode(QrSvg::svg($url, 240, false, null, QrSvg::LOGO_RATIO, '#1C1408'));
        $pad = 1.1;

        return [
            ['t' => 'rect', 'x' => $x, 'y' => $y, 'w' => $mm, 'h' => $mm, 'fill' => '#FFFFFF', 'r' => 1.4],
            ['t' => 'img', 'x' => $x + $pad, 'y' => $y + $pad, 'w' => $mm - 2 * $pad, 'h' => $mm - 2 * $pad, 'src' => $this->qrCache[$url]],
        ];
    }

    /**
     * The logo in a square box: the dark-surface logo on a dark card, the standard one
     * on a light card, and on the rust the standard logo on a cream disc, since the
     * mark's own rust would vanish into it.
     *
     * @return list<array<string, mixed>>
     */
    private function logo(float $x, float $y, float $size, string $bg, bool $dark): array
    {
        $out = [];
        // The mark's own rust and gold vanish into a rust or golden card: a cream disc under it.
        $rust = in_array(strtoupper($bg), ['#B74B0C', '#CA7D1C'], true);
        if ($rust) {
            $out[] = ['t' => 'rect', 'x' => $x, 'y' => $y, 'w' => $size, 'h' => $size, 'fill' => '#F7F5F2', 'r' => $size / 2];
        }
        $src = CardImages::logo($dark && !$rust);
        if ($src !== null) {
            $inset = $rust ? $size * 0.04 : 0;
            $out[] = ['t' => 'img', 'x' => $x + $inset, 'y' => $y + $inset, 'w' => $size - 2 * $inset, 'h' => $size - 2 * $inset, 'src' => $src];
        }

        return $out;
    }
}
