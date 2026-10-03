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
 * floors. When the card is too small for everything, extras go in a fixed
 * order (body text, the "goes straight to" note, the address, the eyebrow,
 * the tagline, the thank-you line, and on a sticker the contact line) and the
 * code takes what is left. The name, the heading, the code and the web
 * address always stay; a card that cannot hold those at these sizes, with the
 * code at least 28 mm, is not offered at all.
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

    private const PT_MM = 0.3528;

    /** Average glyph width as a share of the point size, DejaVu Sans. */
    private const W_REGULAR = 0.56;

    private const W_BOLD = 0.63;

    /**
     * @param array{name: string, tagline: string, url: string, contact: string, address: string} $text
     * @return array<string, mixed>
     */
    public static function for(float $cardW, float $cardH, array $text, bool $hasLogo = true): array
    {
        // Type follows the card's size against the A5 card the design was drawn
        // at — bigger on a poster, smaller on a table card — but never below
        // the floors above.
        $s = min($cardW / 136, $cardH / 198);
        $pt = [
            'name' => max(self::MIN_PT + 2, round(15 * $s, 1)),
            'tagline' => max(self::MIN_PT, round(10 * $s, 1)),
            'eyebrow' => max(self::MIN_PT, round(10 * $s, 1)),
            'title' => max(self::MIN_TITLE_PT, round(19 * $s, 1)),
            'body' => max(self::MIN_PT, round(10.5 * $s, 1)),
            'url' => max(self::MIN_URL_PT, round(12 * $s, 1)),
            'note' => max(self::MIN_PT, round(10 * $s, 1)),
            'contact' => max(self::MIN_PT, round(10.5 * $s, 1)),
            'address' => max(self::MIN_PT, round(10 * $s, 1)),
            'thanks' => max(self::MIN_PT, round(10 * $s, 1)),
        ];
        $padX = round(max(3.0, 5 * $s), 2);
        $innerW = $cardW - 2 * $padX;

        $show = [
            'body' => true, 'note' => true, 'address' => $text['address'] !== '',
            'eyebrow' => true, 'tagline' => $text['tagline'] !== '', 'thanks' => true,
            'contact' => $text['contact'] !== '',
        ];
        // The contact line goes last of all, and only on sticker-sized cards
        // where keeping it would push the code under the minimum.
        $dropOrder = ['body', 'note', 'address', 'eyebrow', 'tagline', 'thanks', 'contact'];

        $logoMm = round(min(22, max(9, $cardH * 0.075)), 2);
        $gapMm = round(max(2, 2.5 * $s), 2);

        while (true) {
            $headText = self::lineMm($pt['name'], 1.15) + ($show['tagline'] ? self::lineMm($pt['tagline'], 1.3) : 0);
            $headH = round(max($hasLogo ? $logoMm : 0, $headText) + 2 * max(2.5, 3 * $s), 2);
            $headW = ($hasLogo ? $logoMm + 3 : 0) + max(
                self::textW($text['name'], $pt['name'], true),
                $show['tagline'] ? self::textW($text['tagline'], $pt['tagline']) : 0,
            );
            // A tagline wider than the card goes before anything else.
            if ($show['tagline'] && $headW > $innerW) {
                $show['tagline'] = false;

                continue;
            }

            $footH = 0.0;
            if ($show['contact'] || $show['address'] || $show['thanks']) {
                $footH = 2 * max(2.5, 3 * $s)
                    + ($show['contact'] ? self::blockMm($text['contact'], $pt['contact'], $innerW, true, 1.3) : 0)
                    + ($show['address'] ? self::blockMm($text['address'], $pt['address'], $innerW, false, 1.3) + 0.8 : 0)
                    + ($show['thanks'] ? self::blockMm(self::THANKS, $pt['thanks'], $innerW, true, 1.3) + 0.8 : 0);
            }

            $bodyText = 2 * max(3.0, 4 * $s)
                + ($show['eyebrow'] ? self::lineMm($pt['eyebrow']) + 1.5 : 0)
                + self::blockMm(self::TITLE, $pt['title'], $innerW, true, 1.2) + 2
                + ($show['body'] ? self::blockMm(self::BODY, $pt['body'], $innerW, false, 1.35) + 3 : 0)
                + 3 // under the code
                + self::blockMm($text['url'], $pt['url'], $innerW, true, 1.3)
                + ($show['note'] ? self::lineMm($pt['note']) + 1 : 0);

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
            'headH' => round($headH, 2),
            'footH' => round($footH, 2),
            'bodyH' => round($bodyH, 2),
            'qrMm' => round(max(0, $qr), 2),
            // The address on the card is one unbreakable word; it has to fit across.
            'fits' => $qr >= self::MIN_QR_MM && self::textW($text['url'], $pt['url'], true) <= $innerW,
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
