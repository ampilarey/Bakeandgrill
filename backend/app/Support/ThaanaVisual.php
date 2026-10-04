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
 * direction of what is either side of them. A consonant keeps its fili (vowel
 * mark) after it, as a grapheme cluster, so the mark still sits on its letter.
 *
 * Only the PDF path should call it. Browsers order Thaana themselves and would
 * reverse it a second time.
 */
final class ThaanaVisual
{
    /** Characters swapped when they sit inside right-to-left text. */
    private const MIRROR = ['(' => ')', ')' => '(', '[' => ']', ']' => '[', '{' => '}', '}' => '{', '<' => '>', '>' => '<', '«' => '»', '»' => '«'];

    /** @var array<string, array{upm: int, widths: array<int, int>}> */
    private static array $metrics = [];

    public static function order(string $text): string
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
            foreach (array_reverse($run['chars']) as $c) {
                $out .= self::MIRROR[$c] ?? $c;
            }
        }

        return $out;
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
