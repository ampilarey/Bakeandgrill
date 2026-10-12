<?php

declare(strict_types=1);

namespace App\Domains\Labels;

/**
 * The pack sticker, as positioned pieces in millimetres from its top-left
 * corner. The full design is the owner's ReportLab sticker (stickers_en.py,
 * stickers_dv.py; docs/LABEL_HUB_PLAN.md §6.1) measured box by box, so the
 * printed result does not change. The Dhivehi sticker is the same boxes
 * mirrored, with the Thaana sizes the original used (Faruma sets small).
 *
 * The mini design is for labels too small for the full one to stay readable
 * (8 and 12 to an A4, small roll labels): the same pieces, stacked, with
 * fixed type no smaller than 5.5pt. Text is broken into lines here rather
 * than by the renderer, so the browser and the PDF print the same lines.
 *
 * Piece shapes:
 *   rect  x y w h fill? stroke? sw? r?
 *   img   x y w h src
 *   text  x base w align(l|c|r) font pt color text ls? bold?
 *         (bold: Faruma has no bold; the original stroked its Thaana, and
 *         the renderer thickens it the same amount with offset copies)
 *   line  x y w color sw
 */
final class StickerDesign
{
    public const PRIMARY = '#B74B0C';

    public const DARK = '#1C1408';

    public const CREAM = '#FFFDF9';

    public const TINT = '#FEF3E8';

    public const MUTED = '#8B7355';

    public const BORDER = '#EDE4D4';

    public const TEXT = '#2A1E0C';

    public const ON_DARK = '#C56F3D';

    public const SOFT = '#CDBFA8';

    private const W = 105.0;

    /**
     * @param array<string, mixed> $d see StickerSheet::stickerData()
     * @return list<array<string, mixed>>
     */
    public static function full(array $d, bool $dv): array
    {
        $p = [];
        $W = self::W;
        // Mirror a box for the Dhivehi sticker.
        $X = fn (float $x, float $w = 0.0): float => $dv ? $W - $x - $w : $x;
        $A = fn (string $align): string => $dv ? ['l' => 'r', 'r' => 'l', 'c' => 'c'][$align] : $align;

        // Header panel, logo, brand line, the heading ("FROZEN HEDHIKA", or the item's own) and its rule.
        // v2 point 6: the header is the brand's (Bake & Grill, or Amma with its own logo).
        $brand = $d['brand'];
        $p[] = ['t' => 'rect', 'x' => 5, 'y' => 5, 'w' => 95, 'h' => 28, 'fill' => self::TINT, 'r' => 3];
        [$lw, $lh] = self::fit($brand['logo_ratio'], 24, 24);
        if ($brand['logo']) {
            $p[] = ['t' => 'img', 'x' => $X(8, $lw), 'y' => 5 + (28 - $lh) / 2, 'w' => $lw, 'h' => $lh, 'src' => $brand['logo']];
        }
        $headX = $X(34, 62);
        $both = !$dv && !empty($d['both']);
        if ($dv) {
            [$top, $bottom] = self::twoWords($d['header_line_dv']);
            $p[] = ['t' => 'text', 'x' => $headX, 'base' => 11.5, 'w' => 62, 'align' => 'r', 'font' => 'dv', 'pt' => 9, 'color' => self::PRIMARY, 'text' => $brand['name_dv'], 'bold' => 0.6];
            $p[] = ['t' => 'text', 'x' => $headX, 'base' => 19.5, 'w' => 62, 'align' => 'r', 'font' => 'dv', 'pt' => 19, 'color' => self::DARK, 'text' => $top, 'bold' => 0.7];
            $p[] = ['t' => 'text', 'x' => $headX, 'base' => 26.5, 'w' => 62, 'align' => 'r', 'font' => 'dv', 'pt' => 19, 'color' => self::DARK, 'text' => $bottom, 'bold' => 0.7];
        } elseif ($both && $d['header_line_dv'] !== '') {
            // Both languages (2026-10-12): the English heading on one line
            // with the Dhivehi heading beneath, in the two lines the English
            // alone spreads over.
            $p[] = ['t' => 'text', 'x' => $headX, 'base' => 12.5, 'w' => 62, 'align' => 'l', 'font' => 'j7', 'pt' => LabelText::fitPt(self::spaced(mb_strtoupper($brand['name'])), 'j7', 61, 7.5, 5), 'color' => self::PRIMARY, 'text' => self::spaced(mb_strtoupper($brand['name']))];
            $p[] = ['t' => 'text', 'x' => $headX, 'base' => 20.5, 'w' => 62, 'align' => 'l', 'font' => 'j8', 'pt' => LabelText::fitPt($d['header_line'], 'j8', 61, 15, 9), 'color' => self::DARK, 'text' => $d['header_line']];
            $p[] = ['t' => 'text', 'x' => $headX, 'base' => 27.4, 'w' => 62, 'align' => 'l', 'font' => 'dv', 'pt' => LabelText::fitPt($d['header_line_dv'], 'dv', 61, 12, 7), 'color' => self::DARK, 'text' => $d['header_line_dv'], 'bold' => 0.7];
        } else {
            [$top, $bottom] = self::twoWords($d['header_line']);
            $p[] = ['t' => 'text', 'x' => $headX, 'base' => 12.5, 'w' => 62, 'align' => 'l', 'font' => 'j7', 'pt' => LabelText::fitPt(self::spaced(mb_strtoupper($brand['name'])), 'j7', 61, 7.5, 5), 'color' => self::PRIMARY, 'text' => self::spaced(mb_strtoupper($brand['name']))];
            $p[] = ['t' => 'text', 'x' => $headX, 'base' => 20.5, 'w' => 62, 'align' => 'l', 'font' => 'j8', 'pt' => self::fitHeader($top), 'color' => self::DARK, 'text' => $top];
            $p[] = ['t' => 'text', 'x' => $headX, 'base' => 28, 'w' => 62, 'align' => 'l', 'font' => 'j8', 'pt' => self::fitHeader($bottom), 'color' => self::DARK, 'text' => $bottom];
        }
        $p[] = ['t' => 'rect', 'x' => $X(34, 14), 'y' => 29.5, 'w' => 14, 'h' => 1, 'fill' => self::PRIMARY];

        // Product name: hand lettering when there is some, else typed.
        $titleTop = 36.5;
        // The Dhivehi sticker types the Dhivehi name, as the original did;
        // the hand lettering is in English.
        if ($d['title_img'] && !($dv && $d['name_dv'] !== '')) {
            [$tw, $th] = self::fit($d['title_ratio'], 72, 15);
            $p[] = ['t' => 'img', 'x' => (self::W - $tw) / 2, 'y' => $titleTop, 'w' => $tw, 'h' => $th, 'src' => $d['title_img']];
        } elseif ($dv) {
            $name = $d['name_dv'] !== '' ? $d['name_dv'] : $d['name'];
            $font = $d['name_dv'] !== '' ? 'dv' : 'dsi';
            $pt = LabelText::fitPt($name, $font, 87, $font === 'dv' ? 30 : 24, 14);
            $th = 15.0;
            $p[] = ['t' => 'text', 'x' => 9, 'base' => $titleTop + 11.5, 'w' => 87, 'align' => 'c', 'font' => $font, 'pt' => $pt, 'color' => self::PRIMARY, 'text' => $name, 'bold' => $font === 'dv' ? 0.7 : 0];
        } else {
            $pt = LabelText::fitPt($d['name'], 'dsi', 72, 24, 14);
            $th = 15.0;
            $p[] = ['t' => 'text', 'x' => 16.5, 'base' => $titleTop + 11, 'w' => 72, 'align' => 'c', 'font' => 'dsi', 'pt' => $pt, 'color' => self::PRIMARY, 'text' => $d['name']];
        }
        // Both languages (2026-10-12): the Dhivehi name under the English one.
        if ($both && $d['name_dv'] !== '') {
            $p[] = ['t' => 'text', 'x' => 9, 'base' => $titleTop + $th + 4.6, 'w' => 87, 'align' => 'c', 'font' => 'dv', 'pt' => LabelText::fitPt($d['name_dv'], 'dv', 87, 14, 9), 'color' => self::PRIMARY, 'text' => $d['name_dv'], 'bold' => 0.6];
            $th += 5.8;
        }

        // The middle, between the name and the date boxes at 99.5: the note
        // and HOW TO USE sit at its foot, the ingredients follow the name, and
        // the picture (a cut-out photo, else the brand mark) takes whatever
        // room the text leaves, up to 28 mm and none under 9. Until
        // 2026-10-12 the band was fixed, and with all three the list, HOW TO
        // USE and the note were drawn over each other. A barcode (2026-10-12)
        // keeps 14.5 mm of the band for the bars.
        $middleTop = $titleTop + $th + ($dv ? 4.0 : 2.5);
        $middleBottom = 98.5;
        $note = $dv ? $d['note_dv'] : $d['note'];
        $noteDv = $both ? $d['note_dv'] : '';
        $noteH = $note !== '' || $noteDv !== '' ? ($dv || $noteDv !== '' ? 4.6 : 3.6) : 0.0;
        // v2 point 8: HOW TO USE, up to two lines (and two Dhivehi lines with
        // both languages), above the note.
        $how = $dv ? $d['how_to_use_dv'] : $d['how_to_use'];
        $howLines = $how !== '' ? array_slice(LabelText::wrap($how, $dv ? 8.2 : 6.6, 90, $dv ? 'dv' : 'j4'), 0, 2) : [];
        $howDvLines = $both && $howLines !== [] && $d['how_to_use_dv'] !== '' ? array_slice(LabelText::wrap($d['how_to_use_dv'], 7.6, 90, 'dv'), 0, 2) : [];
        $howLead = $dv ? 3.9 : 3.1;
        $howDvLead = 3.7;
        $howH = $howLines !== [] ? 2.9 + $howLead * count($howLines) + $howDvLead * count($howDvLines) + 0.8 : 0.0;
        $blockTop = $middleBottom - $noteH - $howH;

        // The ingredients at the largest size that fits above that block with
        // only the band a barcode keeps; broken into lines here, not by the
        // renderer, so the browser and the PDF print the same lines.
        $ing = $dv ? $d['ingredients_dv'] : $d['ingredients_en'];
        $ingDvLines = $both && $ing !== '' && $d['ingredients_dv'] !== '' ? array_slice(LabelText::wrap($d['ingredients_dv'], 8.6, 93, 'dv'), 0, 3) : [];
        $minBand = $d['barcode'] ? 14.5 : 0.0;
        $headH = $dv ? 5.3 : 4.68;
        $ingLines = [];
        $ingPt = $dv ? 9.6 : 7.6;
        $ingLead = $dv ? 4.4 : 3.528;
        $ingText = 0.0;
        if ($ing !== '') {
            $dvH = count($ingDvLines) > 0 ? count($ingDvLines) * 4.2 + 0.4 : 0.0;
            $room = $blockTop - 1.0 - ($middleTop + $minBand + ($minBand > 0 ? 5.0 : 3.6)) - $headH - $dvH;
            if ($dv) {
                $ingLines = array_slice(LabelText::wrap($ing, $ingPt, 93, 'dv'), 0, max(1, (int) floor($room / $ingLead) + 1));
            } else {
                $wrapped = [];
                for ($pt = 7.6; $pt >= 6.2; $pt -= 0.2) {
                    $ingLead = min(3.528, $pt * 1.32 * LabelText::PT);
                    $wrapped = LabelText::wrap($ing, $pt, 85, 'j4');
                    if ((count($wrapped) - 1) * $ingLead <= $room) {
                        break;
                    }
                }
                $ingPt = round($pt, 2);
                $ingLines = array_slice($wrapped, 0, max(1, (int) floor($room / $ingLead) + 1));
            }
            $ingText = $headH + (count($ingLines) - 1) * $ingLead + $dvH + 1.0;
        }
        $band = min($dv ? 25.0 : 28.0, $blockTop - 1.0 - $middleTop - ($ingText > 0 ? 5.0 + $ingText : 0.0));
        $band = $band >= 7.0 ? round($band, 2) : $minBand;

        // The band: a cut-out photo, else the brand mark; with a barcode the
        // bars take the right of the band and the picture what is left.
        $foodTop = $middleTop;
        $barW = $d['barcode'] && $band >= 14.0 ? 28.0 : 0.0;
        $picLeft = 5.0;
        $picSpan = $barW > 0 ? 95.0 - $barW - 2.5 : 95.0;
        if ($barW > 0) {
            $bh = min(11.0, $band - 3.2);
            $bx = $X(100 - $barW, $barW);
            $p[] = ['t' => 'img', 'x' => $bx, 'y' => $foodTop, 'w' => $barW, 'h' => $bh, 'src' => $d['barcode']];
            $p[] = ['t' => 'text', 'x' => $bx, 'base' => $foodTop + $bh + 2.4, 'w' => $barW, 'align' => 'c', 'font' => 'j5', 'pt' => 6.2, 'color' => self::TEXT, 'text' => $d['barcode_text']];
            if ($dv) {
                $picLeft = 5.0 + $barW + 2.5;
            }
        }
        if ($band > 0 && $d['photo']) {
            [$fw, $fh] = self::fit($d['photo_ratio'], min(62.0, $picSpan - 4), $band);
            $p[] = ['t' => 'img', 'x' => $picLeft + ($picSpan - $fw) / 2, 'y' => $foodTop + ($band - $fh) / 2, 'w' => $fw, 'h' => $fh, 'src' => $d['photo']];
        } elseif ($band > 0 && $d['mark']) {
            [$fw, $fh] = self::fit($d['mark_ratio'], 40, min($band, $dv ? 22 : 24));
            $p[] = ['t' => 'img', 'x' => $picLeft + ($picSpan - $fw) / 2, 'y' => $foodTop + ($band - $fh) / 2, 'w' => $fw, 'h' => $fh, 'src' => $d['mark']];
        }

        // Ingredients under the band (allergens bold); with both languages the
        // Dhivehi list follows the English one.
        if ($ing !== '') {
            $ingBase = $middleTop + $band + ($band > 0 ? 5.0 : 3.6);
            if ($dv) {
                $p[] = ['t' => 'text', 'x' => 5, 'base' => $ingBase, 'w' => 95, 'align' => 'c', 'font' => 'dv', 'pt' => 11, 'color' => self::PRIMARY, 'text' => 'ހިމެނޭ ތަކެތި', 'bold' => 0.6];
                foreach ($ingLines as $i => $line) {
                    $p[] = ['t' => 'text', 'x' => 5, 'base' => $ingBase + $headH + $i * $ingLead, 'w' => 95, 'align' => 'c', 'font' => 'dv', 'pt' => $ingPt, 'color' => self::TEXT, 'text' => $line, 'bold' => 0.5];
                }
            } else {
                $p[] = ['t' => 'text', 'x' => 5, 'base' => $ingBase, 'w' => 95, 'align' => 'c', 'font' => 'j7', 'pt' => 7.3, 'color' => self::PRIMARY, 'text' => self::spaced('INGREDIENTS')];
                $last = $ingBase + $headH;
                foreach ($ingLines as $i => $line) {
                    $last = $ingBase + $headH + $i * $ingLead;
                    $p[] = ['t' => 'text', 'x' => 5, 'base' => $last, 'w' => 95, 'align' => 'c', 'font' => 'j4', 'pt' => $ingPt, 'color' => self::TEXT, 'text' => $line, 'bold_words' => $d['allergens']];
                }
                foreach ($ingDvLines as $i => $line) {
                    $p[] = ['t' => 'text', 'x' => 5, 'base' => $last + 4.2 * ($i + 1) + 0.4, 'w' => 95, 'align' => 'c', 'font' => 'dv', 'pt' => 8.6, 'color' => self::TEXT, 'text' => $line, 'bold' => 0.5];
                }
            }
        }
        if ($howLines !== []) {
            $p[] = $dv
                ? ['t' => 'text', 'x' => 5, 'base' => $blockTop + 2.9, 'w' => 95, 'align' => 'c', 'font' => 'dv', 'pt' => 8.6, 'color' => self::PRIMARY, 'text' => 'ބޭނުންކުރާނެ ގޮތް', 'bold' => 0.6]
                : ['t' => 'text', 'x' => 5, 'base' => $blockTop + 2.6, 'w' => 95, 'align' => 'c', 'font' => 'j7', 'pt' => 6.3, 'color' => self::PRIMARY, 'text' => self::spaced('HOW TO USE')];
            foreach ($howLines as $i => $line) {
                $p[] = $dv
                    ? ['t' => 'text', 'x' => 5, 'base' => $blockTop + 2.9 + $howLead * ($i + 1), 'w' => 95, 'align' => 'c', 'font' => 'dv', 'pt' => 8.2, 'color' => self::TEXT, 'text' => $line, 'bold' => 0.4]
                    : ['t' => 'text', 'x' => 5, 'base' => $blockTop + 2.6 + $howLead * ($i + 1), 'w' => 95, 'align' => 'c', 'font' => 'j4', 'pt' => 6.6, 'color' => self::TEXT, 'text' => $line];
            }
            $dvFrom = $blockTop + 2.6 + $howLead * count($howLines) + 0.3;
            foreach ($howDvLines as $i => $line) {
                $p[] = ['t' => 'text', 'x' => 5, 'base' => $dvFrom + $howDvLead * ($i + 1), 'w' => 95, 'align' => 'c', 'font' => 'dv', 'pt' => 7.6, 'color' => self::TEXT, 'text' => $line, 'bold' => 0.4];
            }
        }
        if ($note !== '' || $noteDv !== '') {
            if ($dv) {
                $p[] = ['t' => 'text', 'x' => 5, 'base' => 97.6, 'w' => 95, 'align' => 'c', 'font' => 'dv', 'pt' => LabelText::fitPt($note, 'dv', 92, 8.6, 6.5), 'color' => self::PRIMARY, 'text' => $note, 'bold' => 0.6];
            } elseif ($note !== '' && $noteDv !== '') {
                // Both languages share the line: English on the left, Dhivehi on the right.
                $p[] = ['t' => 'text', 'x' => 5, 'base' => 97.4, 'w' => 45, 'align' => 'r', 'font' => 'j7', 'pt' => LabelText::fitPt($note, 'j7', 44, 6.6, 4.8), 'color' => self::PRIMARY, 'text' => $note];
                $p[] = ['t' => 'text', 'x' => 55, 'base' => 97.8, 'w' => 45, 'align' => 'l', 'font' => 'dv', 'pt' => LabelText::fitPt($noteDv, 'dv', 44, 8.2, 6), 'color' => self::PRIMARY, 'text' => $noteDv, 'bold' => 0.6];
            } else {
                $only = $note !== '' ? $note : $noteDv;
                $font = $note !== '' ? 'j7' : 'dv';
                $p[] = ['t' => 'text', 'x' => 5, 'base' => $font === 'dv' ? 97.8 : 97.4, 'w' => 95, 'align' => 'c', 'font' => $font, 'pt' => LabelText::fitPt($only, $font, 92, $font === 'dv' ? 8.2 : 6.6, 5), 'color' => self::PRIMARY, 'text' => $only] + ($font === 'dv' ? ['bold' => 0.6] : []);
            }
        }

        // MFG and EXP boxes (Dhivehi: made-on on the right), worded by the
        // label type (v2 point 4), with its use-within line beneath. With
        // both languages the strip and the use-within line carry the English
        // on the left and the Dhivehi on the right.
        $within = $dv ? $d['use_within_dv'] : $d['use_within'];
        $withinDv = $both ? $d['use_within_dv'] : '';
        $boxH = $within !== '' || $withinDv !== '' ? 12.4 : 14.0;
        $boxes = $dv
            ? [['ހެދި ތާރީޚު', self::DARK, $d['mfg']], ['ހަމަވާ ތާރީޚު', self::PRIMARY, $d['exp']]]
            : [[$d['mfg_label'], self::DARK, $d['mfg']], [$d['exp_label'], self::PRIMARY, $d['exp']]];
        $dvLabels = ['ހެދި ތާރީޚު', 'ހަމަވާ ތާރީޚު'];
        foreach ($boxes as $i => [$label, $colour, $date]) {
            $bx = $X(5 + $i * 49.5, 45.5);
            $strip = $dv ? 5.6 : 5.2;
            $p[] = ['t' => 'rect', 'x' => $bx, 'y' => 99.5, 'w' => 45.5, 'h' => $boxH, 'fill' => self::CREAM, 'stroke' => $colour, 'sw' => 0.42, 'r' => 2];
            $p[] = ['t' => 'rect', 'x' => $bx, 'y' => 99.5, 'w' => 45.5, 'h' => $strip, 'fill' => $colour, 'r' => 2, 'rb' => 0];
            if ($dv) {
                $p[] = ['t' => 'text', 'x' => $bx, 'base' => 99.5 + 4.2, 'w' => 45.5, 'align' => 'c', 'font' => 'dv', 'pt' => 10.5, 'color' => self::CREAM, 'text' => $label, 'bold' => 0.6];
            } elseif ($both) {
                $p[] = ['t' => 'text', 'x' => $bx + 1.5, 'base' => 99.5 + 3.8, 'w' => 22, 'align' => 'l', 'font' => 'j7', 'pt' => LabelText::fitPt($label, 'j7', 21, 7.4, 5), 'color' => self::CREAM, 'text' => $label];
                $p[] = ['t' => 'text', 'x' => $bx + 23.5, 'base' => 99.5 + 4.1, 'w' => 20.5, 'align' => 'r', 'font' => 'dv', 'pt' => LabelText::fitPt($dvLabels[$i], 'dv', 20, 8.5, 5.5), 'color' => self::CREAM, 'text' => $dvLabels[$i], 'bold' => 0.6];
            } else {
                $p[] = ['t' => 'text', 'x' => $bx, 'base' => 99.5 + 3.8, 'w' => 45.5, 'align' => 'c', 'font' => 'j7', 'pt' => 8, 'color' => self::CREAM, 'text' => $label];
            }
            $dateBase = 99.5 + $boxH - 3.1;
            $p[] = $date
                ? ['t' => 'text', 'x' => $bx, 'base' => $dateBase, 'w' => 45.5, 'align' => 'c', 'font' => 'j7', 'pt' => LabelText::fitPt($date, 'j7', 42, 12, 8), 'color' => self::TEXT, 'text' => $date]
                : ['t' => 'text', 'x' => $bx, 'base' => $dateBase, 'w' => 45.5, 'align' => 'c', 'font' => 'j4', 'pt' => 13, 'color' => self::SOFT, 'text' => '__ /__ /____'];
        }
        if ($within !== '' || $withinDv !== '') {
            if ($dv) {
                $p[] = ['t' => 'text', 'x' => 5, 'base' => 99.5 + $boxH + 3.2, 'w' => 95, 'align' => 'c', 'font' => 'dv', 'pt' => 7.8, 'color' => self::PRIMARY, 'text' => $within, 'bold' => 0.6];
            } elseif ($within !== '' && $withinDv !== '') {
                $p[] = ['t' => 'text', 'x' => 5, 'base' => 99.5 + $boxH + 2.8, 'w' => 46, 'align' => 'r', 'font' => 'j7', 'pt' => LabelText::fitPt($within, 'j7', 45, 6.4, 4.6), 'color' => self::PRIMARY, 'text' => $within];
                $p[] = ['t' => 'text', 'x' => 54, 'base' => 99.5 + $boxH + 3.2, 'w' => 46, 'align' => 'l', 'font' => 'dv', 'pt' => LabelText::fitPt($withinDv, 'dv', 45, 7.8, 5.5), 'color' => self::PRIMARY, 'text' => $withinDv, 'bold' => 0.6];
            } else {
                $only = $within !== '' ? $within : $withinDv;
                $font = $within !== '' ? 'j7' : 'dv';
                $p[] = ['t' => 'text', 'x' => 5, 'base' => 99.5 + $boxH + ($font === 'dv' ? 3.2 : 2.8), 'w' => 95, 'align' => 'c', 'font' => $font, 'pt' => LabelText::fitPt($only, $font, 92, $font === 'dv' ? 7.8 : 6.4, 5), 'color' => self::PRIMARY, 'text' => $only] + ($font === 'dv' ? ['bold' => 0.6] : []);
            }
        }

        // Batch and quantity.
        if ($dv) {
            $label = 'ބެޗް ނަންބަރު:';
            $lw2 = LabelText::widthMm($label, 9.5, 'dv');
            $p[] = ['t' => 'text', 'x' => 52.5, 'base' => 117.8, 'w' => 46.5, 'align' => 'r', 'font' => 'dv', 'pt' => 9.5, 'color' => self::TEXT, 'text' => $label, 'bold' => 0.6];
            if ($d['batch'] !== '') {
                $p[] = ['t' => 'text', 'x' => 40, 'base' => 117.8, 'w' => 59 - $lw2 - 1.5, 'align' => 'r', 'font' => 'j7', 'pt' => 7.5, 'color' => self::TEXT, 'text' => $d['batch']];
            } else {
                $p[] = ['t' => 'line', 'x' => 99 - $lw2 - 25, 'y' => 118.2, 'w' => 24, 'color' => self::SOFT, 'sw' => 0.21];
            }
            $qtyLabel = 'އަދަދު:';
            $pcs = 'ކޮޅު';
            $wp = LabelText::widthMm($pcs, 9.5, 'dv');
            $p[] = ['t' => 'text', 'x' => 6, 'base' => 117.8, 'w' => 20, 'align' => 'l', 'font' => 'dv', 'pt' => 9.5, 'color' => self::TEXT, 'text' => $pcs, 'bold' => 0.6];
            if ($d['qty'] !== '') {
                $p[] = ['t' => 'text', 'x' => 7 + $wp, 'base' => 117.8, 'w' => 14, 'align' => 'c', 'font' => 'j7', 'pt' => 8, 'color' => self::TEXT, 'text' => $d['qty']];
            } else {
                $p[] = ['t' => 'line', 'x' => 7 + $wp, 'y' => 118.2, 'w' => 14, 'color' => self::SOFT, 'sw' => 0.21];
            }
            $p[] = ['t' => 'text', 'x' => 22 + $wp, 'base' => 117.8, 'w' => 20, 'align' => 'l', 'font' => 'dv', 'pt' => 9.5, 'color' => self::TEXT, 'text' => $qtyLabel, 'bold' => 0.6];
        } else {
            $qtyText = 'QTY: ' . ($d['qty'] !== '' ? $d['qty'] : '______') . ' ' . $d['unit'] . ($d['net_weight'] !== '' ? ' · NET ' . $d['net_weight'] : '');
            $p[] = ['t' => 'text', 'x' => 6, 'base' => 117.5, 'w' => 50, 'align' => 'l', 'font' => 'j5', 'pt' => 7.2, 'color' => self::TEXT, 'text' => 'BATCH NO: ' . ($d['batch'] !== '' ? $d['batch'] : '____________')];
            $p[] = ['t' => 'text', 'x' => 49, 'base' => 117.5, 'w' => 50, 'align' => 'r', 'font' => 'j5', 'pt' => LabelText::fitPt($qtyText, 'j5', 48, 7.2, 5.4), 'color' => self::TEXT, 'text' => $qtyText];
            // The price (2026-10-12) between batch and quantity, where the line is empty.
            if ($d['price'] !== '') {
                $p[] = ['t' => 'text', 'x' => 36, 'base' => 117.5, 'w' => 33, 'align' => 'c', 'font' => 'j8', 'pt' => 8, 'color' => self::PRIMARY, 'text' => $d['price']];
            }
        }

        // Storage strip; with both languages it is two rows, English over Dhivehi.
        if ($both && $d['storage_dv'] !== '') {
            $p[] = ['t' => 'rect', 'x' => 5, 'y' => 119.3, 'w' => 95, 'h' => 8.2, 'fill' => self::PRIMARY, 'r' => 1.5];
            $p[] = ['t' => 'text', 'x' => 5, 'base' => 122.6, 'w' => 95, 'align' => 'c', 'font' => 'j7', 'pt' => LabelText::fitPt($d['storage_en'], 'j7', 92, 6.4, 4.8), 'color' => self::CREAM, 'text' => $d['storage_en']];
            $p[] = ['t' => 'text', 'x' => 7.5, 'base' => 126.7, 'w' => 90, 'align' => 'c', 'font' => 'dv', 'pt' => LabelText::fitPt($d['storage_dv'], 'dv', 88, 8, 5.5), 'color' => self::CREAM, 'text' => $d['storage_dv'], 'bold' => 0.8];
        } else {
            $p[] = ['t' => 'rect', 'x' => 5, 'y' => 120.5, 'w' => 95, 'h' => 5.5, 'fill' => self::PRIMARY, 'r' => 1.5];
            if ($dv) {
                $msg = $d['storage_dv'];
                $p[] = ['t' => 'text', 'x' => 7.5, 'base' => 124.3, 'w' => 90, 'align' => 'c', 'font' => 'dv', 'pt' => LabelText::fitPt($msg, 'dv', 88, 8.6, 6), 'color' => self::CREAM, 'text' => $msg, 'bold' => 0.8];
            } else {
                $msg = $d['storage_en'];
                $p[] = ['t' => 'text', 'x' => 5, 'base' => 124.1, 'w' => 95, 'align' => 'c', 'font' => 'j7', 'pt' => LabelText::fitPt($msg, 'j7', 92, 6.8, 5), 'color' => self::CREAM, 'text' => $msg];
            }
        }

        // The footer, always the business's branding (LabelTypes::footer):
        // name, tagline, address, phone, ways to reach you, website and the
        // complaints QR (v2 point 1), the same on every size, in the look the
        // footer preset picked (footerPalette: dark, light, rust, plain, logo).
        $f = $d['footer'];
        $pal = self::footerPalette($f['style'] ?? 'dark');
        if ($pal['band'] !== null) {
            $p[] = ['t' => 'rect', 'x' => 5, 'y' => 128, 'w' => 95, 'h' => 15.5, 'fill' => $pal['band'], 'r' => 2.5];
        }
        if ($pal['rule'] !== null) {
            $p[] = ['t' => 'rect', 'x' => 5, 'y' => 128, 'w' => 95, 'h' => 0.6, 'fill' => $pal['rule'], 'r' => 0.3];
        }
        // The "logo" look sets the whole logo where the mark and the name were.
        $wordmark = $pal['wordmark'] && !empty($d['wordmark']);
        $mw = 0.0;
        if ($wordmark) {
            [$mw, $mh] = self::fit($d['wordmark_ratio'], 13.5, 13.5);
            $p[] = ['t' => 'img', 'x' => $X(6.5, $mw), 'y' => 128 + (15.5 - $mh) / 2, 'w' => $mw, 'h' => $mh, 'src' => $d['wordmark']];
        } elseif ($d['mark'] && $f['show_mark']) {
            [$mw, $mh] = self::fit($d['mark_ratio'], 10, 10.5);
            $p[] = ['t' => 'img', 'x' => $X(8, $mw), 'y' => 128 + (15.5 - $mh) / 2, 'w' => $mw, 'h' => $mh, 'src' => $d['mark']];
        }
        $qr = $d['show_qr'] && $d['qr'] ? 11.5 : 0.0;
        if ($qr > 0) {
            $p[] = ['t' => 'rect', 'x' => $X(86.5, 12.5), 'y' => 129.5, 'w' => 12.5, 'h' => 12.5, 'fill' => self::CREAM, 'r' => 1] + ($pal['qr_stroke'] !== null ? ['stroke' => $pal['qr_stroke'], 'sw' => 0.2] : []);
            $p[] = ['t' => 'img', 'x' => $X(87, $qr), 'y' => 130, 'w' => $qr, 'h' => $qr, 'src' => $d['qr_branded'] ?? $d['qr']];
        }
        $tx = ($wordmark ? 6.5 : 8) + $mw + ($mw > 0 ? 2.5 : 0.0);
        $nameX = $X($tx, 50);
        if (!$wordmark) {
            $p[] = ['t' => 'text', 'x' => $nameX, 'base' => 133.5, 'w' => 50, 'align' => $A('l'), 'font' => 'ds', 'pt' => LabelText::fitPt($f['name'], 'ds', 40, 12.5, 8), 'color' => $pal['ink'], 'text' => $f['name']];
        }
        // The tagline (Dhivehi one on a Dhivehi sticker when there is one)
        // shares its line with the ways-to-reach-you text under the phone, so
        // each keeps to its own half: 34 mm for the tagline, the phone's
        // width for the ways line. With the logo look it takes the name's line.
        $tagline = $dv && $f['tagline_dv'] !== '' ? $f['tagline_dv'] : $f['tagline'];
        $tagFont = $dv && $f['tagline_dv'] !== '' ? 'dv' : 'dsi';
        $tagMax = $wordmark ? 9.5 : ($tagFont === 'dv' ? 8 : 7.8);
        $p[] = ['t' => 'text', 'x' => $nameX, 'base' => $wordmark ? 134.8 : 137.2, 'w' => 50, 'align' => $A('l'), 'font' => $tagFont, 'pt' => LabelText::fitPt($tagline, $tagFont, 34, $tagMax, 5.5), 'color' => $pal['accent'], 'text' => $tagline] + ($tagFont === 'dv' ? ['bold' => 0.4] : []);
        // The address line stops where the website (right-aligned, ~27 mm)
        // begins; with the QR that edge is 12 mm further left. Too long at
        // the smallest size, it drops the landmark.
        $addrW = ($qr > 0 ? 84.5 : 96.5) - 28 - $tx;
        if ($dv) {
            $full = trim($f['address_dv'] . ($f['landmark_dv'] !== '' ? '  •  ' . $f['landmark_dv'] : ''));
            $addr = LabelText::widthMm($full, 7, 'dv') <= $addrW ? $full : trim($f['address_dv']);
            $p[] = ['t' => 'text', 'x' => $X($tx, $addrW), 'base' => 141, 'w' => $addrW, 'align' => 'r', 'font' => 'dv', 'pt' => LabelText::fitPt($addr, 'dv', $addrW, 8, 6.5), 'color' => $pal['soft'], 'text' => $addr, 'bold' => 0.4];
        } else {
            $candidates = [
                trim($f['address'] . ($f['landmark'] !== '' ? '  ·  ' . $f['landmark'] : '')),
                trim($f['address']),
            ];
            $addr = $candidates[0];
            foreach ($candidates as $try) {
                if (LabelText::widthMm($try, 4.4, 'j4') <= $addrW) {
                    $addr = $try;
                    break;
                }
            }
            $p[] = ['t' => 'text', 'x' => $nameX, 'base' => 140.8, 'w' => $addrW, 'align' => 'l', 'font' => 'j4', 'pt' => LabelText::fitPt($addr, 'j4', $addrW, 5.4, 4.2), 'color' => $pal['soft'], 'text' => $addr];
        }
        $rightX = $X($qr > 0 ? 34.5 : 46.5, 50);
        $p[] = ['t' => 'text', 'x' => $rightX, 'base' => 133.5, 'w' => 50, 'align' => $A('r'), 'font' => 'j8', 'pt' => 10.5, 'color' => $pal['ink'], 'text' => $f['phone']];
        $waysW = max(22.0, LabelText::widthMm($f['phone'], 10.5, 'j8'));
        $p[] = $dv
            ? ['t' => 'text', 'x' => $rightX, 'base' => 137.2, 'w' => $waysW, 'align' => 'l', 'font' => 'dv', 'pt' => LabelText::fitPt($f['ways_dv'], 'dv', $waysW, 8, 5.5), 'color' => $pal['accent'], 'text' => $f['ways_dv'], 'bold' => 0.5]
            : ['t' => 'text', 'x' => $rightX, 'base' => 137, 'w' => 50, 'align' => 'r', 'font' => 'j7', 'pt' => LabelText::fitPt($f['ways'], 'j7', $waysW, 5.6, 4), 'color' => $pal['accent'], 'text' => $f['ways']];
        $p[] = ['t' => 'text', 'x' => $rightX, 'base' => 140.8, 'w' => 50, 'align' => $A('r'), 'font' => 'dsi', 'pt' => 10, 'color' => $pal['ink'], 'text' => $f['website']];

        return $p;
    }

    /**
     * The compact sticker for small labels: fixed type, stacked to fit.
     *
     * @param array<string, mixed> $d
     * @return list<array<string, mixed>>
     */
    public static function mini(array $d, bool $dv, float $w, float $h): array
    {
        $p = [];
        $pad = 3.0;
        $iw = $w - 2 * $pad;
        $X = fn (float $x, float $bw = 0.0): float => $dv ? $w - $x - $bw : $x;
        $A = fn (string $align): string => $dv ? ['l' => 'r', 'r' => 'l', 'c' => 'c'][$align] : $align;

        // Header band. Owner, 2026-10-04, on the 8-on-A4 sticker: "There is
        // no header and logo in the printed one. Check the previous format."
        // When the label is tall enough the band carries the full logo and
        // the brand line above the heading, like the original; the smallest
        // labels keep the flame alone.
        $hb = min(19.0, max(13.0, round($h * 0.25, 1)));
        $tall = $hb >= 16.0;
        $p[] = ['t' => 'rect', 'x' => $pad, 'y' => $pad, 'w' => $iw, 'h' => $hb, 'fill' => self::TINT, 'r' => 2];
        $brand = $d['brand'];
        $art = $tall && $brand['logo'] ? $brand['logo'] : $d['mark'];
        [$mw, $mh] = self::fit($tall && $brand['logo'] ? $brand['logo_ratio'] : $d['mark_ratio'], $tall ? $hb - 2 : 9, $tall ? $hb - 2 : 10);
        if ($art) {
            $p[] = ['t' => 'img', 'x' => $X($pad + 1.8, $mw), 'y' => $pad + ($hb - $mh) / 2, 'w' => $mw, 'h' => $mh, 'src' => $art];
        }
        $tx = $pad + 1.8 + $mw + 2;
        $tw = $iw - ($tx - $pad) - 1.5;
        $headBase = $tall ? $pad + 8.2 : $pad + 4.4;
        $nameBase = $tall ? $pad + $hb - 2.6 : $pad + 10.6;
        if ($dv) {
            if ($tall) {
                $p[] = ['t' => 'text', 'x' => $X($tx, $tw), 'base' => $pad + 3.8, 'w' => $tw, 'align' => 'r', 'font' => 'dv', 'pt' => 6.5, 'color' => self::PRIMARY, 'text' => $brand['name_dv'], 'bold' => 0.5];
            }
            $p[] = ['t' => 'text', 'x' => $X($tx, $tw), 'base' => $headBase + ($tall ? 0.6 : 0.2), 'w' => $tw, 'align' => 'r', 'font' => 'dv', 'pt' => $tall ? 9 : 8, 'color' => self::DARK, 'text' => $d['header_line_dv'], 'bold' => 0.6];
            $name = $d['name_dv'] !== '' ? $d['name_dv'] : $d['name'];
            $font = $d['name_dv'] !== '' ? 'dv' : 'dsi';
            $p[] = ['t' => 'text', 'x' => $X($tx, $tw), 'base' => $nameBase + 0.2, 'w' => $tw, 'align' => 'r', 'font' => $font, 'pt' => LabelText::fitPt($name, $font, $tw, 16, 9), 'color' => self::PRIMARY, 'text' => $name, 'bold' => $font === 'dv' ? 0.7 : 0];
        } else {
            if ($tall) {
                $p[] = ['t' => 'text', 'x' => $tx, 'base' => $pad + 3.6, 'w' => $tw, 'align' => 'l', 'font' => 'j7', 'pt' => LabelText::fitPt(self::spaced(mb_strtoupper($brand['name'])), 'j7', $tw, 5, 3.8), 'color' => self::PRIMARY, 'text' => self::spaced(mb_strtoupper($brand['name']))];
            }
            if (!empty($d['both']) && $d['header_line_dv'] !== '') {
                // Both languages: the English heading and the Dhivehi one share the line.
                $ew = $tw * 0.56;
                $p[] = ['t' => 'text', 'x' => $tx, 'base' => $headBase, 'w' => $ew, 'align' => 'l', 'font' => 'j8', 'pt' => LabelText::fitPt($d['header_line'], 'j8', $ew, $tall ? 8.5 : 6.5, 5), 'color' => self::DARK, 'text' => $d['header_line']];
                $p[] = ['t' => 'text', 'x' => $tx + $ew + 1, 'base' => $headBase + 0.3, 'w' => $tw - $ew - 1, 'align' => 'r', 'font' => 'dv', 'pt' => LabelText::fitPt($d['header_line_dv'], 'dv', $tw - $ew - 1.5, $tall ? 8.5 : 6.8, 4.5), 'color' => self::DARK, 'text' => $d['header_line_dv'], 'bold' => 0.6];
            } else {
                $p[] = ['t' => 'text', 'x' => $tx, 'base' => $headBase, 'w' => $tw, 'align' => 'l', 'font' => 'j8', 'pt' => $tall ? LabelText::fitPt($d['header_line'], 'j8', $tw, 8.5, 6) : 6.5, 'color' => self::DARK, 'text' => $d['header_line'], 'ls' => 0.04];
            }
            if (!empty($d['both']) && $d['name_dv'] !== '') {
                // Both languages (owner, 2026-10-12: "when i select both
                // languages it shows English only"): the English name a
                // little smaller with the Dhivehi name on the line beneath.
                $p[] = ['t' => 'text', 'x' => $tx, 'base' => $nameBase - 4.2, 'w' => $tw, 'align' => 'l', 'font' => 'dsi', 'pt' => LabelText::fitPt($d['name'], 'dsi', $tw, 11, 8), 'color' => self::PRIMARY, 'text' => $d['name']];
                $p[] = ['t' => 'text', 'x' => $tx, 'base' => $nameBase + 0.8, 'w' => $tw, 'align' => 'l', 'font' => 'dv', 'pt' => LabelText::fitPt($d['name_dv'], 'dv', $tw, 8, 6), 'color' => self::PRIMARY, 'text' => $d['name_dv'], 'bold' => 0.6];
            } else {
                $p[] = ['t' => 'text', 'x' => $tx, 'base' => $nameBase, 'w' => $tw, 'align' => 'l', 'font' => 'dsi', 'pt' => LabelText::fitPt($d['name'], 'dsi', $tw, 16, 9), 'color' => self::PRIMARY, 'text' => $d['name']];
            }
        }

        // Footer and storage strip from the bottom up, so the ingredients get
        // whatever height the label has between them.
        // Owner, 2026-10-04: "There is no website." A tall label gets the
        // two-line footer of the original: name and address, phone and website.
        $f = $d['footer'];
        $pal = self::footerPalette($f['style'] ?? 'dark');
        $fh = $tall ? 9.6 : 6.0;
        $fy = $h - $pad - $fh;
        if ($pal['band'] !== null) {
            $p[] = ['t' => 'rect', 'x' => $pad, 'y' => $fy, 'w' => $iw, 'h' => $fh, 'fill' => $pal['band'], 'r' => 1.5];
        }
        if ($pal['rule'] !== null) {
            $p[] = ['t' => 'rect', 'x' => $pad, 'y' => $fy, 'w' => $iw, 'h' => 0.5, 'fill' => $pal['rule'], 'r' => 0.25];
        }
        // The complaints QR at the end of a tall footer (v2 point 1); the right-hand text moves over.
        $qr = $tall && $d['show_qr'] && $d['qr'] ? $fh - 1.6 : 0.0;
        $rshift = $qr > 0 ? $qr + 2.4 : 0.0;
        if ($qr > 0) {
            $p[] = ['t' => 'rect', 'x' => $X($pad + $iw - 0.8 - $qr - 0.8, $qr + 1.6), 'y' => $fy + 0.4, 'w' => $qr + 1.6, 'h' => $qr + 1.6, 'fill' => self::CREAM, 'r' => 0.8] + ($pal['qr_stroke'] !== null ? ['stroke' => $pal['qr_stroke'], 'sw' => 0.2] : []);
            $p[] = ['t' => 'img', 'x' => $X($pad + $iw - 0.8 - $qr, $qr), 'y' => $fy + 0.8, 'w' => $qr, 'h' => $qr, 'src' => $d['qr']];
        }
        // The "logo" look sets the whole logo in the name's place; the lines beside it move over.
        $lw = 0.0;
        if ($pal['wordmark'] && !empty($d['wordmark'])) {
            [$lw, $lh] = self::fit($d['wordmark_ratio'], $fh - 1.0, $fh - 1.0);
            $p[] = ['t' => 'img', 'x' => $X($pad + 1.0, $lw), 'y' => $fy + ($fh - $lh) / 2, 'w' => $lw, 'h' => $lh, 'src' => $d['wordmark']];
            $lw += 1.2;
        } else {
            $p[] = ['t' => 'text', 'x' => $X($pad + 2, $iw / 2), 'base' => $fy + 4.1, 'w' => $iw / 2, 'align' => $A('l'), 'font' => 'ds', 'pt' => LabelText::fitPt($f['name'], 'ds', $iw / 2 - 2, 8.5, 6), 'color' => $pal['ink'], 'text' => $f['name']];
        }
        $p[] = ['t' => 'text', 'x' => $X($pad + $iw / 2 - 2, $iw / 2 - $rshift), 'base' => $fy + 4.1, 'w' => $iw / 2 - $rshift, 'align' => $A('r'), 'font' => 'j8', 'pt' => 7.5, 'color' => $pal['ink'], 'text' => $f['phone']];
        if ($tall) {
            // A footer's own tagline takes the website's place (owner,
            // 2026-10-12). It needs more room than "bakeandgrill.mv", so
            // beside it the address line drops the landmark and keeps to the
            // left 42 %; the tagline takes what is left before the QR.
            $own = self::ownFooter($d, $dv);
            $addr = $own !== null
                ? trim($dv ? $f['address_dv'] : $f['address'])
                : ($dv ? trim($f['address_dv'] . ($f['landmark_dv'] !== '' ? '  ·  ' . $f['landmark_dv'] : '')) : trim($f['address'] . ($f['landmark'] !== '' ? '  ·  ' . $f['landmark'] : '')));
            $addrW = ($own !== null ? $iw * 0.42 : $iw * 0.55) - $lw;
            $p[] = $dv
                ? ['t' => 'text', 'x' => $X($pad + 2 + $lw, $addrW), 'base' => $fy + 8.2, 'w' => $addrW, 'align' => 'r', 'font' => 'dv', 'pt' => $own !== null ? LabelText::fitPt($addr, 'dv', $addrW - 1, 6.5, 5) : 6.5, 'color' => $pal['soft'], 'text' => $addr, 'bold' => 0.4]
                : ['t' => 'text', 'x' => $pad + 2 + $lw, 'base' => $fy + 8, 'w' => $addrW, 'align' => 'l', 'font' => 'j4', 'pt' => LabelText::fitPt($addr, 'j4', $addrW - 2, 5.2, 4.0), 'color' => $pal['soft'], 'text' => $addr];
            [$site, $siteFont] = $own ?? [$f['website'], 'dsi'];
            $siteX = $own !== null ? $pad + 2 + $lw + $addrW + 1 : $pad + $iw / 2 - 2;
            $siteW = $pad + $iw - 2 - $rshift - $siteX;
            $p[] = ['t' => 'text', 'x' => $X($siteX, $siteW), 'base' => $fy + 8.1, 'w' => $siteW, 'align' => $A('r'), 'font' => $siteFont, 'pt' => $siteFont === 'dv' ? LabelText::fitPt($site, 'dv', $siteW - 1, 7.5, 4.5) : LabelText::fitPt($site, 'dsi', $siteW - 1, 7, 4.0), 'color' => $pal['ink'], 'text' => $site] + ($siteFont === 'dv' ? ['bold' => 0.5] : []);
        }

        $both = !$dv && !empty($d['both']) && $d['storage_dv'] !== '';
        $sh = $both ? 8.6 : 4.6;
        $sy = $fy - 1.5 - $sh;
        $p[] = ['t' => 'rect', 'x' => $pad, 'y' => $sy, 'w' => $iw, 'h' => $sh, 'fill' => self::PRIMARY, 'r' => 1.2];
        $msg = $dv ? $d['storage_dv'] : $d['storage_en'];
        $sf = $dv ? 'dv' : 'j7';
        $p[] = ['t' => 'text', 'x' => $pad + 1, 'base' => $sy + 3.25, 'w' => $iw - 2, 'align' => 'c', 'font' => $sf, 'pt' => LabelText::fitPt($msg, $sf, $iw - 3, $dv ? 7.5 : 6, 4.6), 'color' => self::CREAM, 'text' => $msg];
        if ($both) {
            $p[] = ['t' => 'text', 'x' => $pad + 1, 'base' => $sy + 7.4, 'w' => $iw - 2, 'align' => 'c', 'font' => 'dv', 'pt' => LabelText::fitPt($d['storage_dv'], 'dv', $iw - 3, 7.2, 4.6), 'color' => self::CREAM, 'text' => $d['storage_dv'], 'bold' => 0.7];
        }

        // Batch and quantity.
        $by = $sy - 2.2;
        if ($dv) {
            $p[] = ['t' => 'text', 'x' => $pad + 1, 'base' => $by, 'w' => $iw - 2, 'align' => 'r', 'font' => 'dv', 'pt' => 7.5, 'color' => self::TEXT, 'text' => 'ބެޗް: ' . ($d['batch'] !== '' ? $d['batch'] : '..............')];
            $p[] = ['t' => 'text', 'x' => $pad + 1, 'base' => $by, 'w' => $iw - 2, 'align' => 'l', 'font' => 'dv', 'pt' => 7.5, 'color' => self::TEXT, 'text' => 'އަދަދު: ' . ($d['qty'] !== '' ? $d['qty'] : '........')];
        } else {
            $batchText = 'BATCH: ' . ($d['batch'] !== '' ? $d['batch'] : '__________');
            $qtyText = ($d['price'] !== '' ? $d['price'] . '  ·  ' : '') . 'QTY: ' . ($d['qty'] !== '' ? $d['qty'] : '____') . ' ' . $d['unit'] . ($d['net_weight'] !== '' ? ' · ' . $d['net_weight'] : '');
            $bw = LabelText::widthMm($batchText, 5.8, 'j5');
            $p[] = ['t' => 'text', 'x' => $pad + 1, 'base' => $by, 'w' => $iw - 2, 'align' => 'l', 'font' => 'j5', 'pt' => 5.8, 'color' => self::TEXT, 'text' => $batchText];
            $p[] = ['t' => 'text', 'x' => $pad + 1, 'base' => $by, 'w' => $iw - 2, 'align' => 'r', 'font' => 'j5', 'pt' => LabelText::fitPt($qtyText, 'j5', $iw - 4 - $bw, 5.8, 4.2), 'color' => self::TEXT, 'text' => $qtyText];
        }

        // Dates.
        $dh = 9.0;
        // v2 point 4: a use-within line under the date boxes when the label is tall enough.
        $within = $tall ? ($dv ? $d['use_within_dv'] : $d['use_within']) : '';
        $withinH = $within !== '' ? 2.8 : 0.0;
        $dy = $by - 2.6 - $dh - $withinH;
        $dw = ($iw - 2.5) / 2;
        if ($within !== '') {
            if (!$dv && !empty($d['both']) && $d['use_within_dv'] !== '' && $iw >= 56) {
                // Both languages share the line: English on the left, Dhivehi on the right.
                $half = ($iw - 2) / 2;
                $p[] = ['t' => 'text', 'x' => $pad, 'base' => $dy + $dh + 2.3, 'w' => $half, 'align' => 'r', 'font' => 'j7', 'pt' => LabelText::fitPt($within, 'j7', $half - 1, 5.2, 4.0), 'color' => self::PRIMARY, 'text' => $within];
                $p[] = ['t' => 'text', 'x' => $pad + $half + 2, 'base' => $dy + $dh + 2.6, 'w' => $half, 'align' => 'l', 'font' => 'dv', 'pt' => LabelText::fitPt($d['use_within_dv'], 'dv', $half - 1, 6.6, 4.4), 'color' => self::PRIMARY, 'text' => $d['use_within_dv'], 'bold' => 0.5];
            } else {
                $p[] = $dv
                    ? ['t' => 'text', 'x' => $pad, 'base' => $dy + $dh + 2.6, 'w' => $iw, 'align' => 'c', 'font' => 'dv', 'pt' => 6.8, 'color' => self::PRIMARY, 'text' => $within, 'bold' => 0.5]
                    : ['t' => 'text', 'x' => $pad, 'base' => $dy + $dh + 2.3, 'w' => $iw, 'align' => 'c', 'font' => 'j7', 'pt' => LabelText::fitPt($within, 'j7', $iw - 2, 5.2, 4.2), 'color' => self::PRIMARY, 'text' => $within];
            }
        }
        $boxes = $dv
            ? [['ހެދި', self::DARK, $d['mfg']], ['ހަމަވާ', self::PRIMARY, $d['exp']]]
            : [[$d['mfg_label'], self::DARK, $d['mfg']], [$d['exp_label'], self::PRIMARY, $d['exp']]];
        foreach ($boxes as $i => [$label, $colour, $date]) {
            $bx = $X($pad + $i * ($dw + 2.5), $dw);
            $p[] = ['t' => 'rect', 'x' => $bx, 'y' => $dy, 'w' => $dw, 'h' => $dh, 'fill' => self::CREAM, 'stroke' => $colour, 'sw' => 0.35, 'r' => 1.4];
            $p[] = ['t' => 'rect', 'x' => $bx, 'y' => $dy, 'w' => $dw, 'h' => 3.4, 'fill' => $colour, 'r' => 1.4, 'rb' => 0];
            if (!$dv && !empty($d['both']) && $dw >= 26) {
                // Both languages: the English label on the left of the strip, the short Dhivehi one on the right.
                $dvShort = ['ހެދި', 'ހަމަވާ'][$i];
                $p[] = ['t' => 'text', 'x' => $bx + 1, 'base' => $dy + 2.55, 'w' => $dw * 0.58, 'align' => 'l', 'font' => 'j7', 'pt' => LabelText::fitPt($label, 'j7', $dw * 0.58 - 1, 5.8, 4.0), 'color' => self::CREAM, 'text' => $label];
                $p[] = ['t' => 'text', 'x' => $bx + $dw * 0.6, 'base' => $dy + 2.75, 'w' => $dw * 0.4 - 1, 'align' => 'r', 'font' => 'dv', 'pt' => LabelText::fitPt($dvShort, 'dv', $dw * 0.4 - 1.5, 6.5, 4.0), 'color' => self::CREAM, 'text' => $dvShort, 'bold' => 0.5];
            } else {
                $p[] = ['t' => 'text', 'x' => $bx, 'base' => $dy + 2.55, 'w' => $dw, 'align' => 'c', 'font' => $dv ? 'dv' : 'j7', 'pt' => $dv ? 7 : LabelText::fitPt($label, 'j7', $dw - 2, 5.8, 4.2), 'color' => self::CREAM, 'text' => $label];
            }
            $dateText = $date ?: '__ /__ /____';
            $p[] = ['t' => 'text', 'x' => $bx, 'base' => $dy + 7.6, 'w' => $dw, 'align' => 'c', 'font' => $date ? 'j7' : 'j4', 'pt' => LabelText::fitPt($dateText, $date ? 'j7' : 'j4', $dw - 2, 9, 6), 'color' => $date ? self::TEXT : self::SOFT, 'text' => $dateText];
        }

        // Ingredients fill what is left between the header and the dates,
        // then the photo takes any room still spare.
        // Owner, 2026-10-04: "If ingredients are not entered don't show it":
        // no heading without a list, and the picture takes the room.
        $top = $pad + $hb + 3.4;
        // A barcode (2026-10-12) keeps its room at the foot of the middle when
        // the label is tall enough for the ingredients as well; the compact
        // sizes in use (66 × 72, 99 × 70.5) are not, so the barcode is for
        // the full sticker.
        $reserve = $d['barcode'] && ($dy - 1.5 - $top) >= 26 ? 14.5 : 0.0;
        $room = $dy - 1.5 - $top - $reserve;
        $usedTo = $top - 2.4;
        $has = ($dv ? $d['ingredients_dv'] : $d['ingredients_en']) !== '';
        if ($dv && $has) {
            $p[] = ['t' => 'text', 'x' => $pad, 'base' => $top + 1, 'w' => $iw, 'align' => 'c', 'font' => 'dv', 'pt' => 7.5, 'color' => self::PRIMARY, 'text' => 'ހިމެނޭ ތަކެތި'];
            $lines = LabelText::wrap($d['ingredients_dv'], 7.5, $iw - 2, 'dv');
            $max = max(0, (int) floor(($room - 3.4) / 3.5));
            foreach (array_slice($lines, 0, $max) as $i => $line) {
                $p[] = ['t' => 'text', 'x' => $pad, 'base' => $top + 4.6 + $i * 3.5, 'w' => $iw, 'align' => 'c', 'font' => 'dv', 'pt' => 7.5, 'color' => self::TEXT, 'text' => $line, 'bold' => 0.4];
                $usedTo = $top + 4.6 + $i * 3.5 + 1.2;
            }
        } elseif ($has) {
            $p[] = ['t' => 'text', 'x' => $pad, 'base' => $top + 0.6, 'w' => $iw, 'align' => 'c', 'font' => 'j7', 'pt' => 5.5, 'color' => self::PRIMARY, 'text' => self::spaced('INGREDIENTS')];

            $pt = self::paraFit($d['ingredients_en'], $iw - 2, $room - 2.2, 6.2, 5.5);
            $lead = $pt * 1.28 * LabelText::PT;
            $max = max(1, (int) floor(($room - 2.2) / $lead));
            foreach (array_slice(LabelText::wrap($d['ingredients_en'], $pt, $iw - 2, 'j4'), 0, $max) as $i => $line) {
                $p[] = ['t' => 'text', 'x' => $pad, 'base' => $top + 3.2 + $i * $lead, 'w' => $iw, 'align' => 'c', 'font' => 'j4', 'pt' => $pt, 'color' => self::TEXT, 'text' => $line, 'bold_words' => $d['allergens']];
                $usedTo = $top + 3.2 + $i * $lead + 0.8;
            }
            // Both languages: the Dhivehi list beneath, while there is room.
            if (!empty($d['both']) && $d['ingredients_dv'] !== '') {
                $dvMax = max(0, (int) floor(($dy - 1.5 - ($usedTo + 1.8)) / 3.4));
                foreach (array_slice(LabelText::wrap($d['ingredients_dv'], 7.2, $iw - 2, 'dv'), 0, min(2, $dvMax)) as $i => $line) {
                    $p[] = ['t' => 'text', 'x' => $pad, 'base' => $usedTo + 2.6 + $i * 3.4, 'w' => $iw, 'align' => 'c', 'font' => 'dv', 'pt' => 7.2, 'color' => self::TEXT, 'text' => $line, 'bold' => 0.4];
                }
                $usedTo += min(2, $dvMax) * 3.4;
            }
        }

        // v2 point 8: HOW TO USE under the ingredients when there is room for it.
        $how = $dv ? $d['how_to_use_dv'] : $d['how_to_use'];
        $roomNow = $dy - 1.5 - $reserve - ($usedTo + 1.5);
        if ($how !== '' && $roomNow >= 6.5) {
            $hf = $dv ? 'dv' : 'j4';
            $hpt = $dv ? 7 : 5.3;
            $maxLines = $roomNow >= 9.5 ? 2 : 1;
            $lines = array_slice(LabelText::wrap($how, $hpt, $iw - 2, $hf), 0, $maxLines);
            $p[] = $dv
                ? ['t' => 'text', 'x' => $pad, 'base' => $usedTo + 3.3, 'w' => $iw, 'align' => 'c', 'font' => 'dv', 'pt' => 6.5, 'color' => self::PRIMARY, 'text' => 'ބޭނުންކުރާނެ ގޮތް', 'bold' => 0.5]
                : ['t' => 'text', 'x' => $pad, 'base' => $usedTo + 3.1, 'w' => $iw, 'align' => 'c', 'font' => 'j7', 'pt' => 4.8, 'color' => self::PRIMARY, 'text' => self::spaced('HOW TO USE')];
            foreach ($lines as $i => $line) {
                $p[] = ['t' => 'text', 'x' => $pad, 'base' => $usedTo + 3.1 + 2.7 * ($i + 1) + ($dv ? 0.4 : 0), 'w' => $iw, 'align' => 'c', 'font' => $hf, 'pt' => $hpt, 'color' => self::TEXT, 'text' => $line, 'bold' => $dv ? 0.4 : 0];
            }
            $usedTo += 3.1 + 2.7 * count($lines) + 0.6;
            if (!$dv && !empty($d['both']) && $d['how_to_use_dv'] !== '') {
                // Both languages: the Dhivehi lines follow while there is room above the dates.
                $dvLines = array_slice(LabelText::wrap($d['how_to_use_dv'], 6.6, $iw - 2, 'dv'), 0, max(0, min(2, (int) floor(($dy - 1.5 - $reserve - ($usedTo + 0.6)) / 3.0))));
                foreach ($dvLines as $i => $line) {
                    $p[] = ['t' => 'text', 'x' => $pad, 'base' => $usedTo + 3.0 * ($i + 1) - 0.2, 'w' => $iw, 'align' => 'c', 'font' => 'dv', 'pt' => 6.6, 'color' => self::TEXT, 'text' => $line, 'bold' => 0.4];
                }
                $usedTo += 3.0 * count($dvLines);
            }
        } elseif ($how !== '' && $roomNow >= 3.2) {
            // A tight label (99 x 70 with the two-line footer) gets it on one line.
            $line = ($dv ? 'ބޭނުންކުރާނެ ގޮތް: ' : 'HOW TO USE: ') . $how;
            $hf = $dv ? 'dv' : 'j5';
            $p[] = ['t' => 'text', 'x' => $pad, 'base' => $usedTo + 2.9, 'w' => $iw, 'align' => 'c', 'font' => $hf, 'pt' => LabelText::fitPt($line, $hf, $iw - 2, $dv ? 6.8 : 5.2, 4.2), 'color' => self::TEXT, 'text' => $line, 'bold' => $dv ? 0.4 : 0];
            $usedTo += 3.3;
        }

        $spare = $dy - 1.5 - ($usedTo + 1.5);
        $pic = $d['photo'] ?: $d['mark'];
        $picRatio = $d['photo'] ? $d['photo_ratio'] : $d['mark_ratio'];
        // A barcode (2026-10-12) takes the spare room before the picture does.
        if ($reserve > 0 && $spare >= 9) {
            $bw = min($iw * 0.62, 30.0);
            $bh = min($spare - 3.2, 11.0);
            $bx = ($w - $bw) / 2;
            $byTop = $usedTo + 1.5 + ($spare - $bh - 3.0) / 2;
            $p[] = ['t' => 'img', 'x' => $bx, 'y' => $byTop, 'w' => $bw, 'h' => $bh, 'src' => $d['barcode']];
            $p[] = ['t' => 'text', 'x' => $bx, 'base' => $byTop + $bh + 2.3, 'w' => $bw, 'align' => 'c', 'font' => 'j5', 'pt' => 5.6, 'color' => self::TEXT, 'text' => $d['barcode_text']];
        } elseif ($pic && $spare >= 9) {
            [$fw, $fh] = self::fit($picRatio, $iw * 0.7, min($spare, $d['photo'] ? 30 : 22));
            $p[] = ['t' => 'img', 'x' => ($w - $fw) / 2, 'y' => $usedTo + 1.5 + ($spare - $fh) / 2, 'w' => $fw, 'h' => $fh, 'src' => $pic];
        }

        return $p;
    }

    /**
     * The round sticker (v2 point 2): everything centred, each row no wider
     * than the circle is at that height. Laid out for a 50 mm circle and
     * scaled up for bigger ones; from 68 mm there is room for the QR beside
     * the ingredients and a batch line.
     *
     * @param array<string, mixed> $d
     * @return list<array<string, mixed>>
     */
    public static function round(array $d, bool $dv, float $D): array
    {
        // Under 45 mm the rows below shrink past reading; the small round
        // sticker drops the ingredients and keeps the name and dates big.
        if ($D < 45) {
            return SmallStickerDesign::round($d, $dv, $D);
        }
        $p = [];
        $r = $D / 2;
        $k = $D / 50;
        $f = min($k, 1.5); // type grows with the circle, but not without limit
        // How wide the circle is at $y from the top, less a margin.
        $chord = fn (float $y): float => max(10.0, 2 * sqrt(max(0.0, $r * $r - ($y - $r) * ($y - $r))) - 3.0 * $k);
        $centred = fn (float $y, float $w): float => ($D - $w) / 2;
        $text = fn (float $y, float $w, string $font, float $pt, string $color, string $t, float $bold = 0.0) => ['t' => 'text', 'x' => $centred($y, $w), 'base' => $y, 'w' => $w, 'align' => 'c', 'font' => $font, 'pt' => $pt, 'color' => $color, 'text' => $t] + ($bold > 0 ? ['bold' => $bold] : []);
        $brand = $d['brand'];
        $ft = $d['footer'];
        $big = $D >= 68;

        // Brand line, heading, rule, name.
        $y = 5.6 * $k;
        $w = $chord($y);
        $p[] = $dv
            ? $text($y + 0.4 * $f, $w, 'dv', 5.2 * $f, self::PRIMARY, $brand['name_dv'], 0.5)
            : $text($y, $w, 'j7', LabelText::fitPt(self::spaced(mb_strtoupper($brand['name'])), 'j7', $w, 4.4 * $f, 3.4), self::PRIMARY, self::spaced(mb_strtoupper($brand['name'])));
        $y = 10.2 * $k;
        $w = $chord($y - 1.5 * $k);
        $head = $dv ? $d['header_line_dv'] : $d['header_line'];
        $p[] = $dv
            ? $text($y + 0.6 * $f, $w, 'dv', LabelText::fitPt($head, 'dv', $w, 8.5 * $f, 6), self::DARK, $head, 0.7)
            : $text($y, $w, 'j8', LabelText::fitPt($head, 'j8', $w, 7 * $f, 4.6), self::DARK, $head);
        $p[] = ['t' => 'rect', 'x' => ($D - 9 * $k) / 2, 'y' => 11.4 * $k, 'w' => 9 * $k, 'h' => 0.7 * $k, 'fill' => self::PRIMARY];
        $y = 18 * $k;
        $w = $chord($y - 3 * $k);
        $name = $dv && $d['name_dv'] !== '' ? $d['name_dv'] : $d['name'];
        $nf = $dv && $d['name_dv'] !== '' ? 'dv' : 'dsi';
        $both = !$dv && !empty($d['both']) && $d['name_dv'] !== '';
        if ($both) {
            // Both languages (2026-10-12): the English name a little higher
            // and smaller, the Dhivehi name beneath; the zone below starts lower.
            $p[] = $text(16.4 * $k, $w, 'dsi', LabelText::fitPt($d['name'], 'dsi', $w, 10.5 * $f, 6), self::PRIMARY, $d['name']);
            $p[] = $text(20.8 * $k, $chord(18.6 * $k), 'dv', LabelText::fitPt($d['name_dv'], 'dv', $chord(18.6 * $k), 7.6 * $f, 5), self::PRIMARY, $d['name_dv'], 0.6);
        } else {
            $p[] = $text($y + ($nf === 'dv' ? 0.5 * $f : 0), $w, $nf, LabelText::fitPt($name, $nf, $w, 12.5 * $f, 7), self::PRIMARY, $name, $nf === 'dv' ? 0.7 : 0.0);
        }

        // Ingredients (or the picture) between the name and the dates; on a
        // big circle the brand logo sits to their left and the QR to their
        // right, so the round sticker carries the same branding as the rest.
        $top = ($both ? 21.6 : 19.8) * $k;
        $zoneH = 29.0 * $k - $top;
        $qr = $big && $d['show_qr'] && $d['qr'] ? 9.5 : 0.0;
        $logo = $big && $brand['logo'] ? 11.0 : 0.0;
        $ing = $dv ? $d['ingredients_dv'] : $d['ingredients_en'];
        $full = $chord($top + $zoneH / 2);
        $zx = ($D - $full) / 2;
        if ($logo > 0) {
            [$lw, $lh] = self::fit($brand['logo_ratio'], $logo, $logo);
            $p[] = ['t' => 'img', 'x' => $zx + 0.5 + ($logo - $lw) / 2, 'y' => $top + ($zoneH - $lh) / 2, 'w' => $lw, 'h' => $lh, 'src' => $brand['logo']];
            $zx += $logo + 2.5;
        }
        if ($qr > 0) {
            $qx = ($D + $full) / 2 - $qr - 0.5;
            $qy = $top + ($zoneH - $qr) / 2;
            $p[] = ['t' => 'rect', 'x' => $qx - 0.6, 'y' => $qy - 0.6, 'w' => $qr + 1.2, 'h' => $qr + 1.2, 'fill' => self::CREAM, 'stroke' => self::SOFT, 'sw' => 0.2, 'r' => 0.8];
            $p[] = ['t' => 'img', 'x' => $qx, 'y' => $qy, 'w' => $qr, 'h' => $qr, 'src' => $d['qr']];
        }
        $zw = ($D + $full) / 2 - ($qr > 0 ? $qr + 3 : 0) - $zx;
        if ($ing !== '') {
            $lf = $dv ? 'dv' : 'j4';
            $lpt = $dv ? 6.4 * $f : 4.7 * $f;
            $lead = $dv ? 2.9 * $f : 2.5 * $f;
            $p[] = $dv
                ? ['t' => 'text', 'x' => $zx, 'base' => $top + 2.6 * $f, 'w' => $zw, 'align' => 'c', 'font' => 'dv', 'pt' => 5.6 * $f, 'color' => self::PRIMARY, 'text' => 'ހިމެނޭ ތަކެތި', 'bold' => 0.5]
                : ['t' => 'text', 'x' => $zx, 'base' => $top + 2.3 * $f, 'w' => $zw, 'align' => 'c', 'font' => 'j7', 'pt' => 3.9 * $f, 'color' => self::PRIMARY, 'text' => self::spaced('INGREDIENTS')];
            // Both languages: the last line of the zone is the first Dhivehi line of the list.
            $dvLine = !$dv && !empty($d['both']) && $d['ingredients_dv'] !== '' ? (LabelText::wrap($d['ingredients_dv'], 5.8 * $f, $zw - 1, 'dv')[0] ?? '') : '';
            $max = max(1, (int) floor(($zoneH - 2.6 * $f) / $lead) - ($dvLine !== '' ? 1 : 0));
            $lines = array_slice(LabelText::wrap($ing, $lpt, $zw - 1, $lf), 0, $max);
            foreach ($lines as $i => $line) {
                $p[] = ['t' => 'text', 'x' => $zx, 'base' => $top + 2.3 * $f + $lead * ($i + 1), 'w' => $zw, 'align' => 'c', 'font' => $lf, 'pt' => $lpt, 'color' => self::TEXT, 'text' => $line] + ($dv ? ['bold' => 0.4] : ['bold_words' => $d['allergens']]);
            }
            if ($dvLine !== '') {
                $p[] = ['t' => 'text', 'x' => $zx, 'base' => $top + 2.3 * $f + $lead * (count($lines) + 1) + 0.4 * $f, 'w' => $zw, 'align' => 'c', 'font' => 'dv', 'pt' => 5.8 * $f, 'color' => self::TEXT, 'text' => $dvLine, 'bold' => 0.4];
            }
        } elseif ($d['photo'] ?: $d['mark']) {
            $pic = $d['photo'] ?: $d['mark'];
            [$pw, $ph] = self::fit($d['photo'] ? $d['photo_ratio'] : $d['mark_ratio'], $zw * 0.8, $zoneH - 0.5);
            $p[] = ['t' => 'img', 'x' => $zx + ($zw - $pw) / 2, 'y' => $top + ($zoneH - $ph) / 2, 'w' => $pw, 'h' => $ph, 'src' => $pic];
        }

        // Dates on two lines, then the use-within line (and a batch line on a big circle).
        $blank = '__ / __ / ____';
        $rows = $dv
            ? [['ހެދި ތާރީޚު', $d['mfg']], ['ހަމަވާ ތާރީޚު', $d['exp']]]
            : [[$d['mfg_label'], $d['mfg']], [$d['exp_label'], $d['exp']]];
        $y = 31.6 * $k;
        foreach ($rows as $i => [$label, $date]) {
            $w = $chord($y);
            $line = $dv ? ($date ?: $blank) . '  :' . $label : $label . ':  ' . ($date ?: $blank);
            $p[] = $dv
                ? $text($y + 0.4 * $f, $w, 'dv', LabelText::fitPt($line, 'dv', $w, 6.6 * $f, 5), $i === 0 ? self::DARK : self::PRIMARY, $line, 0.6)
                : $text($y, $w, 'j7', LabelText::fitPt($line, 'j7', $w, 5 * $f, 3.8), $i === 0 ? self::DARK : self::PRIMARY, $line);
            $y += 2.9 * $f;
        }
        $within = $dv ? $d['use_within_dv'] : $d['use_within'];
        $y = 37.1 * $k;
        if ($big) {
            $bq = ($dv ? 'ބެޗް: ' : 'BATCH: ') . ($d['batch'] !== '' ? $d['batch'] : '________') . '   ·   ' . ($dv ? 'އަދަދު: ' : 'QTY: ') . ($d['qty'] !== '' ? $d['qty'] : '____') . ($dv ? '' : ' ' . $d['unit']) . ($d['price'] !== '' ? '   ·   ' . $d['price'] : '');
            $w = $chord($y);
            $p[] = $text($y, $w, $dv ? 'dv' : 'j5', LabelText::fitPt($bq, $dv ? 'dv' : 'j5', $w, ($dv ? 6 : 4.6) * $f, 3.8), self::TEXT, $bq, $dv ? 0.4 : 0.0);
            $y += 2.6 * $f;
        }
        if ($within !== '') {
            $w = $chord($y);
            $p[] = $text($y, $w, $dv ? 'dv' : 'j7', LabelText::fitPt($within, $dv ? 'dv' : 'j7', $w, ($dv ? 5.6 : 4.1) * $f, 3.4), self::PRIMARY, $within, $dv ? 0.5 : 0.0);
        }

        // Storage strip and the footer line.
        $sy = 40.3 * $k;
        $sh = 3.4 * $f;
        $sw = $chord($sy + $sh / 2) - 1;
        $p[] = ['t' => 'rect', 'x' => ($D - $sw) / 2, 'y' => $sy, 'w' => $sw, 'h' => $sh, 'fill' => self::PRIMARY, 'r' => 1];
        $msg = $dv ? $d['storage_dv'] : $d['storage_en'];
        $sf = $dv ? 'dv' : 'j7';
        // A small circle keeps the first clause of a long storage line ("KEEP
        // FROZEN AT -18°C OR BELOW") rather than shrinking it past reading.
        if (LabelText::widthMm($msg, 3.4, $sf) > $sw - 3 && preg_match('/^(.+?)\s+[•·]\s+/u', $msg, $m)) {
            $msg = trim($m[1]);
        }
        $p[] = $text($sy + $sh * 0.72, $sw - 2, $sf, LabelText::fitPt($msg, $sf, $sw - 3, ($dv ? 5.6 : 4.2) * $f, 3.2), self::CREAM, $msg, $dv ? 0.7 : 0.0);
        $y = 46.4 * $k;
        $w = $chord($y - 1.2 * $f);
        // A footer's own tagline takes the website's place.
        [$site, $siteFont] = self::ownFooter($d, $dv) ?? [$ft['website'], 'j7'];
        $foot = $ft['name'] . '  ·  ' . $ft['phone'] . '  ·  ' . $site;
        if (LabelText::widthMm($foot, 3.6, $siteFont) > $w) {
            $foot = $ft['phone'] . '  ·  ' . $site;
        }
        if ($siteFont === 'dv' && LabelText::widthMm($foot, 3.6, 'dv') > $w) {
            $foot = $site;
        }
        // No band on a circle: the rust look colours the line, the others keep it dark.
        $p[] = $text($y, $w, $siteFont, LabelText::fitPt($foot, $siteFont, $w, ($siteFont === 'dv' ? 5.4 : 4.3) * $f, 3.2), ($ft['style'] ?? 'dark') === 'rust' ? self::PRIMARY : self::DARK, $foot, $siteFont === 'dv' ? 0.5 : 0.0);

        return $p;
    }

    /**
     * A footer preset's own tagline (owner, 2026-10-12: "add option to edit
     * footer also"), which the compact designs print where the website would
     * go: the Dhivehi one on a Dhivehi sticker when it has one, set in the
     * Dhivehi face when it holds Thaana. Null when the footer is the brand's
     * own, so the website prints as before.
     *
     * @param array<string, mixed> $d
     * @return array{0: string, 1: string}|null
     */
    public static function ownFooter(array $d, bool $dv): ?array
    {
        $f = $d['footer'] ?? null;
        if (!is_array($f) || empty($f['own'])) {
            return null;
        }
        $text = $dv && $f['tagline_dv'] !== '' ? (string) $f['tagline_dv'] : (string) $f['tagline'];
        if ($text === '') {
            return null;
        }

        return [$text, \App\Support\ThaanaVisual::hasThaana($text) ? 'dv' : 'dsi'];
    }

    /** Secondary ink on the rust band (the footer's "rust" look): cream warmed towards the band. */
    public const ON_RUST = '#FFE3CF';

    public const ON_RUST_SOFT = '#F4CBB0';

    /**
     * How a footer look draws (owner, 2026-10-12: footers "in different
     * styles"; LabelFooter::STYLES): the band fill (null: no band), a rule
     * along the top (null: none), the main ink (name, phone, website), the
     * accent (tagline, ways to reach you), the soft ink (address), a border
     * for the QR's white box on a pale ground, and whether the whole logo
     * stands where the mark and the name were.
     *
     * @return array{band: ?string, rule: ?string, ink: string, accent: string, soft: string, qr_stroke: ?string, wordmark: bool}
     */
    public static function footerPalette(string $style): array
    {
        return match ($style) {
            'light' => ['band' => self::TINT, 'rule' => self::PRIMARY, 'ink' => self::TEXT, 'accent' => self::PRIMARY, 'soft' => self::MUTED, 'qr_stroke' => self::BORDER, 'wordmark' => false],
            'rust' => ['band' => self::PRIMARY, 'rule' => null, 'ink' => self::CREAM, 'accent' => self::ON_RUST, 'soft' => self::ON_RUST_SOFT, 'qr_stroke' => null, 'wordmark' => false],
            'plain' => ['band' => null, 'rule' => self::PRIMARY, 'ink' => self::TEXT, 'accent' => self::PRIMARY, 'soft' => self::MUTED, 'qr_stroke' => self::BORDER, 'wordmark' => false],
            'logo' => ['band' => self::DARK, 'rule' => null, 'ink' => self::CREAM, 'accent' => self::ON_DARK, 'soft' => self::SOFT, 'qr_stroke' => null, 'wordmark' => true],
            default => ['band' => self::DARK, 'rule' => null, 'ink' => self::CREAM, 'accent' => self::ON_DARK, 'soft' => self::SOFT, 'qr_stroke' => null, 'wordmark' => false],
        };
    }

    /**
     * Width and height of a picture of $ratio (w ÷ h) fitted inside $w × $h.
     *
     * @return array{0: float, 1: float}
     */
    public static function fit(float $ratio, float $w, float $h): array
    {
        $ratio = $ratio > 0 ? $ratio : 1.0;
        if ($w / $h > $ratio) {
            return [round($h * $ratio, 3), $h];
        }

        return [$w, round($w / $ratio, 3)];
    }

    /** "B A K E   &   G R I L L": letters spaced as the original sticker set them. */
    public static function spaced(string $text): string
    {
        $words = preg_split('/\s+/u', trim($text)) ?: [];

        return implode('   ', array_map(fn ($w) => implode(' ', mb_str_split($w)), $words));
    }

    /** "FROZEN HEDHIKA" on two lines; a longer line splits at its last space. */
    private static function twoWords(string $line): array
    {
        $line = trim($line);
        $at = mb_strrpos($line, ' ');

        return $at === false ? [$line, ''] : [mb_substr($line, 0, $at), mb_substr($line, $at + 1)];
    }

    private static function fitHeader(string $word): float
    {
        return LabelText::fitPt($word, 'j8', 61, 19, 11);
    }

    /** The largest size from $max down to $min at which the paragraph fits its box. */
    private static function paraFit(string $text, float $w, float $h, float $max, float $min): float
    {
        for ($pt = $max; $pt > $min; $pt -= 0.2) {
            $lines = count(LabelText::wrap($text, $pt, $w * 0.96, 'j4'));
            if ($lines * $pt * 1.28 * LabelText::PT <= $h) {
                return round($pt, 2);
            }
        }

        return $min;
    }
}
