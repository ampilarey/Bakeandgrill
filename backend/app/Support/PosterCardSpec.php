<?php

declare(strict_types=1);

namespace App\Support;

/**
 * How one complaint-QR card is laid out at a given size.
 *
 * Owner, 2026-10-03: "I need the exact layout to be printed. I think 20 is
 * too much. Font size should be 12, or 10 at the minimum, so the maximum
 * number of stickers on one page should align with this."
 *
 * So type never goes below 10pt (the web address 11pt, the heading 12pt),
 * and the layout is worked out from the real text, line by line, rather than
 * by shrinking everything to fit. Larger cards scale the type up from those
 * floors.
 *
 * Then: "keep the same poster, with the same header and footer, without any
 * change, even at 12 or 9 per page." The header (logo, name, tagline) and the
 * footer (contact line, address, thank-you line) are on every card, whatever
 * its size; only the middle gives way on a small card, in a fixed order (the
 * body text, the "goes straight to" note, then the eyebrow), and the code
 * takes what is left. The heading, the code and the web address always stay.
 * A card that cannot hold all that at these sizes, with the code at least
 * 28 mm, does not fit, and that layout is not offered. The 9- and 12-up
 * sheets are the exception, at the owner's asking: see whole().
 *
 * Widths are estimated with DejaVu Sans proportions (the PDF's font, and the
 * widest of the fonts the page uses), so the browser never wraps a line the
 * estimate did not allow for.
 */
final class PosterCardSpec
{
    public const MIN_PT = 10.0;

    public const MIN_URL_PT = 11.0;

    public const MIN_TITLE_PT = 12.0;

    /** Below this a phone at arm's length struggles; no layout goes under it. */
    public const MIN_QR_MM = 28.0;

    /** "Tell the owner." kept together, so a narrow card breaks after the question. */
    public const TITLE = "Not happy? Tell\u{00A0}the\u{00A0}owner.";

    public const BODY = 'Staff, food, service, cleanliness — scan and tell us. Anonymous if you like, or leave your number and we will message you back.';

    public const NOTE = "Goes straight to the owner's phone.";

    public const EYEBROW = 'COMPLAINT BOX';

    public const THANKS = 'THANK YOU FOR HELPING US DO BETTER';

    /** Where the thank-you line splits when it has to: two even halves. */
    public const THANKS_SPLIT = ['THANK YOU FOR HELPING', 'US DO BETTER'];

    private const PT_MM = 0.3528;

    /** Average glyph width as a share of the point size, DejaVu Sans. */
    private const W_REGULAR = 0.56;

    private const W_BOLD = 0.63;

    /**
     * The thank-you line's width per character as a share of the point size:
     * 0.68 for these capitals in DejaVu Sans Bold (measured with dompdf's own
     * font metrics; capitals are wider than the average above) plus its
     * 0.04em letter-spacing.
     */
    private const THANKS_EM = 0.72;

    /**
     * @param array{name: string, tagline: string, url: string, contact: string, address: string} $text
     * @return array<string, mixed>
     */
    public static function for(float $cardW, float $cardH, array $text, bool $hasLogo = true): array
    {
        return self::build($cardW, $cardH, $text, $hasLogo, 1.0, ['body', 'note', 'eyebrow']);
    }

    /**
     * The whole card, nothing left off, for the 9- and 12-up sheets.
     *
     * Owner, 2026-10-03, after hearing those could not keep the header and
     * footer at 10pt: "Make 9 and 12 per page also, without changing
     * anything." So the card carries exactly what the 6-up table card does
     * (the whole header and footer, the eyebrow, the heading, the code, the
     * web address and the note; the longer body text is not on either) and
     * the type comes down together, in small steps, until the code is back to
     * its minimum. The sheet page says how small that is.
     *
     * @param array{name: string, tagline: string, url: string, contact: string, address: string} $text
     * @return array<string, mixed>
     */
    public static function whole(float $cardW, float $cardH, array $text, bool $hasLogo = true): array
    {
        for ($k = 1.0; $k > 0.3; $k -= 0.025) {
            $spec = self::build($cardW, $cardH, $text, $hasLogo, $k, ['body']);
            if ($spec['fits']) {
                return $spec;
            }
        }

        return $spec;
    }

    /**
     * @param array{name: string, tagline: string, url: string, contact: string, address: string} $text
     * @param float $k how far the floors are lowered: 1 keeps 10pt
     * @param list<string> $dropOrder what may be left off, first to last
     * @return array<string, mixed>
     */
    private static function build(float $cardW, float $cardH, array $text, bool $hasLogo, float $k, array $dropOrder): array
    {
        // Type follows the card's size against the A5 card the design was drawn
        // at — bigger on a poster, smaller on a table card — but never below
        // the floors above.
        $s = min($cardW / 136, $cardH / 198);
        $min = self::MIN_PT * $k;
        $pt = [
            'name' => round(max($min + 2 * $k, 15 * $s), 1),
            'tagline' => round(max($min, 10 * $s), 1),
            'eyebrow' => round(max($min, 10 * $s), 1),
            'title' => round(max(self::MIN_TITLE_PT * $k, 19 * $s), 1),
            'body' => round(max($min, 10.5 * $s), 1),
            'url' => round(max(self::MIN_URL_PT * $k, 12 * $s), 1),
            'note' => round(max($min, 10 * $s), 1),
            'contact' => round(max($min, 10.5 * $s), 1),
            'address' => round(max($min, 10 * $s), 1),
            'thanks' => round(max($min, 10 * $s), 1),
        ];
        // Spacing comes down with the type when the floors are lowered.
        $gap = fn (float $mm): float => round($mm * $k, 2);
        $padX = round(max(3.0 * $k, 5 * $s), 2);
        $innerW = $cardW - 2 * $padX;
        // The thank-you line on one line, as on the poster, or where it does
        // not fit across, split evenly in two (never "BETTER" on its own).
        $thanksLines = mb_strlen(self::THANKS) * $pt['thanks'] * self::PT_MM * self::THANKS_EM <= $innerW ? 1 : 2;

        $show = [
            'body' => true, 'note' => true, 'address' => $text['address'] !== '',
            'eyebrow' => true, 'tagline' => $text['tagline'] !== '', 'thanks' => true,
            'contact' => $text['contact'] !== '',
        ];
        $logoMm = round(min(22, max(9 * $k, $cardH * 0.075)), 2);
        $gapMm = round(max(2, 2.5 * $s), 2);

        while (true) {
            // The name and tagline sit beside the logo and wrap there if long.
            $headTextW = $innerW - ($hasLogo ? $logoMm + $gap(3) : 0);
            $headText = self::blockMm($text['name'], $pt['name'], $headTextW, true, 1.15)
                + ($show['tagline'] ? self::blockMm($text['tagline'], $pt['tagline'], $headTextW, false, 1.3) : 0);
            $headH = round(max($hasLogo ? $logoMm : 0, $headText) + 2 * max($gap(2.5), 3 * $s), 2);

            $footH = 0.0;
            if ($show['contact'] || $show['address'] || $show['thanks']) {
                $footH = 2 * max($gap(2.5), 3 * $s)
                    + ($show['contact'] ? self::blockMm($text['contact'], $pt['contact'], $innerW, true, 1.3) : 0)
                    + ($show['address'] ? self::blockMm($text['address'], $pt['address'], $innerW, false, 1.3) + $gap(0.8) : 0)
                    + ($show['thanks'] ? $thanksLines * self::lineMm($pt['thanks']) + $gap(0.8) : 0);
            }

            $bodyText = 2 * max($gap(3), 4 * $s)
                + ($show['eyebrow'] ? self::lineMm($pt['eyebrow']) + $gap(1.5) : 0)
                + self::blockMm(self::TITLE, $pt['title'], $innerW, true, 1.2) + $gap(2)
                + ($show['body'] ? self::blockMm(self::BODY, $pt['body'], $innerW, false, 1.35) + $gap(3) : 0)
                + $gap(3) // under the code
                + self::blockMm($text['url'], $pt['url'], $innerW, true, 1.3)
                + ($show['note'] ? self::lineMm($pt['note']) + $gap(1) : 0);

            $bodyH = $cardH - $headH - $footH;
            $qr = min($innerW, $bodyH - $bodyText, $cardW * 0.78);

            if ($qr >= self::MIN_QR_MM || !self::dropNext($show, $dropOrder)) {
                break;
            }
        }

        return [
            'pt' => $pt,
            'show' => $show,
            'padX' => $padX,
            'logoMm' => $logoMm,
            'gapMm' => $gapMm,
            // The fixed gaps between lines, in mm, as the blade spaces them.
            'sp' => ['logo' => $gap(3), 'eyebrow' => $gap(1.5), 'title' => $gap(2), 'body' => $gap(3), 'qr' => $gap(3), 'note' => $gap(1), 'foot' => $gap(0.8)],
            'headH' => round($headH, 2),
            'headTextMm' => round($headTextW, 2),
            'thanksLines' => $thanksLines,
            'footH' => round($footH, 2),
            'bodyH' => round($bodyH, 2),
            'qrMm' => round(max(0, $qr), 2),
            // The address on the card is one unbreakable word; it has to fit across.
            'fits' => $qr >= self::MIN_QR_MM
                && self::textW($text['url'], $pt['url'], true) <= $innerW
                && self::longestWordW($text['name'], $pt['name'], true) <= $headTextW,
            'rule' => round(max(0.6, 0.9 * $s), 2),
            'minPt' => min($pt),
        ];
    }

    /** @param array<string, bool> $show @param list<string> $order */
    private static function dropNext(array &$show, array $order): bool
    {
        foreach ($order as $key) {
            if ($show[$key]) {
                $show[$key] = false;

                return true;
            }
        }

        return false;
    }

    private static function longestWordW(string $s, float $pt, bool $bold): float
    {
        return max(array_map(fn (string $w) => self::textW($w, $pt, $bold), preg_split('/\s+/u', trim($s)) ?: ['']));
    }

    private static function lineMm(float $pt, float $leading = 1.3): float
    {
        return $pt * self::PT_MM * $leading;
    }

    private static function textW(string $s, float $pt, bool $bold = false): float
    {
        return mb_strlen($s) * $pt * self::PT_MM * ($bold ? self::W_BOLD : self::W_REGULAR);
    }

    /** Height of a wrapped paragraph, counting whole words onto lines. */
    private static function blockMm(string $s, float $pt, float $width, bool $bold, float $leading): float
    {
        $lines = 1;
        $used = 0.0;
        $space = self::textW(' ', $pt, $bold);
        foreach (preg_split('/\s+/u', trim($s)) ?: [] as $word) {
            $w = self::textW($word, $pt, $bold);
            if ($used > 0 && $used + $space + $w > $width) {
                $lines++;
                $used = $w;
            } else {
                $used += ($used > 0 ? $space : 0) + $w;
            }
        }

        return $lines * self::lineMm($pt, $leading);
    }
}
