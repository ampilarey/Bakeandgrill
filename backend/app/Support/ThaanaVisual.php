<?php

declare(strict_types=1);

namespace App\Support;

use FontLib\Font;

/**
 * Thaana (Dhivehi) text in visual order, for the PDF renderer.
 *
 * dompdf does not run the bidirectional algorithm: it draws characters in the
 * order they are stored, left to right. Thaana is written right to left, so a
 * Dhivehi line came out with every word mirrored and the words in reverse
 * order (checked 2026-10-04 with A_Faruma; browsers are fine, which is why the
 * screen versions never showed it). order() hands dompdf the characters in the
 * order they should appear on the page, left to right; the view then prints the
 * result left-to-right and right-aligned.
 *
 * A simplified bidi for an RTL paragraph: Thaana and its punctuation run right
 * to left, Latin letters and digits keep their own left-to-right order inside
 * it ("-18°C", "bakeandgrill.mv"), and spaces and punctuation take the
 * direction of what is either side of them. Within a cluster the fili (vowel
 * mark) goes before its consonant, which is where an unshaped renderer has to
 * meet it to set it over the letter (checked against Pillow with RAQM).
 *
 * Only the PDF path should call it. Browsers order Thaana themselves and would
 * reverse it a second time.
 */
final class ThaanaVisual
{
    /** Characters swapped when they sit inside right-to-left text. */
    private const MIRROR = ['(' => ')', ')' => '(', '[' => ']', ']' => '[', '{' => '}', '}' => '{', '<' => '>', '>' => '<', '«' => '»', '»' => '«'];

    /**
     * A letter and its fili as one glyph, for a face built by
     * scripts/thaana-composed-font.py: dompdf never positions a mark by the
     * font's anchors, so Noto's fili drifted off wide letters (2026-10-12).
     * The pair glyph sits at U+E000 + letter index × 16 + mark index, letters
     * U+0780 (HAA) to U+07B1 (NAA), marks U+07A6 (ABAFILI) to U+07B0 (SUKUN);
     * fixtures/thaana_pairs.json holds the same numbers for the script.
     */
    public const PAIR_BASE = 0xE000;

    private const LETTER_FIRST = 0x0780;

    private const LETTER_LAST = 0x07B1;

    private const MARK_FIRST = 0x07A6;

    private const MARK_LAST = 0x07B0;

    /** @var array<string, array{upm: int, widths: array<int, int>}> */
    private static array $metrics = [];

    /**
     * The visual order dompdf needs. With $composed (the face has the pair
     * glyphs) each letter-plus-fili cluster becomes its pair glyph; otherwise
     * the fili goes just before its letter, where Faruma's marks expect it.
     */
    public static function order(string $text, bool $composed = false): string
    {
        if ($text === '' || !self::hasThaana($text)) {
            return $text;
        }

        preg_match_all('/\X/u', $text, $m);
        $clusters = $m[0];
        $dir = self::signsToNumbers($clusters, array_map(self::direction(...), $clusters));

        // A neutral between two left-to-right clusters is left-to-right;
        // every other neutral follows the paragraph, right-to-left.
        $n = count($clusters);
        for ($i = 0; $i < $n; $i++) {
            if ($dir[$i] !== 'n') {
                continue;
            }
            $prev = null;
            for ($j = $i - 1; $j >= 0; $j--) {
                if ($dir[$j] !== 'n') {
                    $prev = $dir[$j];
                    break;
                }
            }
            $next = null;
            for ($j = $i + 1; $j < $n; $j++) {
                if ($dir[$j] !== 'n') {
                    $next = $dir[$j];
                    break;
                }
            }
            $dir[$i] = ($prev === 'l' && $next === 'l') ? 'l' : 'r';
        }

        // Runs of one direction, in logical order.
        $runs = [];
        foreach ($clusters as $i => $c) {
            $last = array_key_last($runs);
            if ($last !== null && $runs[$last]['dir'] === $dir[$i]) {
                $runs[$last]['chars'][] = $c;
            } else {
                $runs[] = ['dir' => $dir[$i], 'chars' => [$c]];
            }
        }

        $out = '';
        foreach (array_reverse($runs) as $run) {
            if ($run['dir'] === 'l') {
                $out .= implode('', $run['chars']);
                continue;
            }
            // Code point by code point, so each fili lands just before its
            // consonant: Faruma's marks have no advance and are drawn from the
            // pen position, which in a right-to-left font is the letter's left
            // edge. In cluster order (letter, then mark) dompdf set every mark
            // beside its letter instead of over it. A composed face draws the
            // pair as one glyph instead.
            foreach (array_reverse($run['chars']) as $c) {
                $out .= self::MIRROR[$c] ?? ($composed ? self::composeCluster($c) : implode('', array_reverse(mb_str_split($c))));
            }
        }

        return $out;
    }

    /** The pair glyph's character for a Thaana letter and fili, or null when either is not one. */
    public static function pair(int $letter, int $mark): ?string
    {
        if ($letter < self::LETTER_FIRST || $letter > self::LETTER_LAST || ($letter >= self::MARK_FIRST && $letter <= self::MARK_LAST)) {
            return null;
        }
        if ($mark < self::MARK_FIRST || $mark > self::MARK_LAST) {
            return null;
        }

        return mb_chr(self::PAIR_BASE + ($letter - self::LETTER_FIRST) * 16 + ($mark - self::MARK_FIRST), 'UTF-8');
    }

    /** A grapheme cluster for a composed face: letter + fili as the pair glyph, anything further reversed behind it. */
    private static function composeCluster(string $cluster): string
    {
        $chars = mb_str_split($cluster);
        if (count($chars) >= 2) {
            $pair = self::pair(mb_ord($chars[0]), mb_ord($chars[1]));
            if ($pair !== null) {
                return $pair . implode('', array_reverse(array_slice($chars, 2)));
            }
        }

        return implode('', array_reverse($chars));
    }

    /**
     * Break text into lines no wider than $maxMm at $pt, in logical order, so
     * each line can be ordered on its own (dompdf must never wrap an ordered
     * string: it would break it at the wrong end). Widths come from the font's
     * own advance widths.
     *
     * @return list<string>
     */
    public static function wrap(string $text, float $pt, float $maxMm, ?string $fontFile = null): array
    {
        $text = trim((string) preg_replace('/\s+/u', ' ', $text));
        if ($text === '') {
            return [];
        }
        $lines = [];
        $line = '';
        foreach (explode(' ', $text) as $word) {
            $try = $line === '' ? $word : $line . ' ' . $word;
            if ($line !== '' && self::widthMm($try, $pt, $fontFile) > $maxMm) {
                $lines[] = $line;
                $line = $word;
            } else {
                $line = $try;
            }
        }
        $lines[] = $line;

        return $lines;
    }

    /** Width of $text at $pt in mm. Characters the font lacks count as a space. */
    public static function widthMm(string $text, float $pt, ?string $fontFile = null): float
    {
        $metrics = self::metrics($fontFile ?? self::defaultFont());
        if ($metrics === null) {
            // No font to measure: a generous average so lines break early, not late.
            return mb_strlen($text) * $pt * 0.3528 * 0.6;
        }
        $units = 0;
        $space = $metrics['widths'][0x20] ?? (int) ($metrics['upm'] / 2);
        foreach (mb_str_split($text) as $ch) {
            $units += $metrics['widths'][mb_ord($ch)] ?? $space;
        }

        return $units / $metrics['upm'] * $pt * 0.3528;
    }

    public static function hasThaana(string $text): bool
    {
        return (bool) preg_match('/[\x{0780}-\x{07BF}]/u', $text);
    }

    private static function direction(string $cluster): string
    {
        $cp = mb_ord(mb_substr($cluster, 0, 1));
        if (($cp >= 0x0780 && $cp <= 0x07BF) || in_array($cp, [0x060C, 0x061B, 0x061F, 0xFDF2], true)) {
            return 'r';
        }
        if (preg_match('/^[\p{L}\p{N}]/u', $cluster)) {
            return 'l';
        }

        return 'n';
    }

    /**
     * A sign straight before a digit belongs to the number: "-18°C" stays "-18°C".
     *
     * @param list<string> $clusters
     * @param list<string> $dir
     * @return list<string>
     */
    private static function signsToNumbers(array $clusters, array $dir): array
    {
        foreach ($clusters as $i => $c) {
            if (($c === '-' || $c === '+' || $c === '−') && isset($clusters[$i + 1]) && preg_match('/^\p{N}/u', $clusters[$i + 1])) {
                $dir[$i] = 'l';
            }
            // A percent sign or currency after a number stays with it ("15%"), as the
            // Unicode bidi rules keep a European terminator with its digits.
            if (($c === '%' || $c === '٪') && $i > 0 && preg_match('/\p{N}$/u', $clusters[$i - 1])) {
                $dir[$i] = 'l';
            }
        }

        return $dir;
    }

    private static function defaultFont(): string
    {
        return public_path('fonts/a_faruma.ttf');
    }

    /** @return array{upm: int, widths: array<int, int>}|null */
    private static function metrics(string $file): ?array
    {
        if (array_key_exists($file, self::$metrics)) {
            return self::$metrics[$file];
        }
        if (!is_file($file)) {
            return null;
        }
        try {
            $font = Font::load($file);
            $font->parse();
            $upm = (int) ($font->getData('head')['unitsPerEm'] ?? 1000);
            $hmtx = $font->getData('hmtx');
            $widths = [];
            foreach ($font->getData('cmap')['subtables'] ?? [] as $table) {
                foreach ($table['glyphIndexArray'] ?? [] as $cp => $glyph) {
                    if (!isset($widths[$cp]) && isset($hmtx[$glyph][0])) {
                        $widths[(int) $cp] = (int) $hmtx[$glyph][0];
                    }
                }
            }
            $font->close();
        } catch (\Throwable) {
            return self::$metrics[$file] = null;
        }

        return self::$metrics[$file] = ['upm' => $upm, 'widths' => $widths];
    }
}
