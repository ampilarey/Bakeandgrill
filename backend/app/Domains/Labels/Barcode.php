<?php

declare(strict_types=1);

namespace App\Domains\Labels;

/**
 * An EAN-13 or EAN-8 barcode for a pack sticker (2026-10-12), so a shop can
 * scan the pack at its own till. The code is typed on the item's Label tab
 * or the custom label; 12 (or 7) digits get their check digit worked out,
 * 13 (or 8) are checked. Drawn as bars only, in an SVG data URI the sticker
 * places like any picture; the digits print beneath it as text, in the
 * label's own font, so the PDF and the browser set them alike.
 */
final class Barcode
{
    private const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];

    private const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];

    private const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];

    /** EAN-13: which of the six left digits use the G set, by the first digit. */
    private const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

    /**
     * The code as it will print, with its check digit, or null when it is
     * not an EAN-13 (12 or 13 digits) or an EAN-8 (7 or 8 digits).
     */
    public static function normalise(?string $raw): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) $raw) ?? '';
        $n = strlen($digits);
        if ($n === 12 || $n === 7) {
            return $digits . self::checkDigit($digits);
        }
        if (($n === 13 || $n === 8) && self::checkDigit(substr($digits, 0, -1)) === substr($digits, -1)) {
            return $digits;
        }

        return null;
    }

    /** Why a typed code is refused, for the form. */
    public static function problem(?string $raw): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) $raw) ?? '';
        if ($digits === '') {
            return null;
        }
        if (!in_array(strlen($digits), [7, 8, 12, 13], true)) {
            return 'A barcode is 12 or 13 digits (EAN-13), or 7 or 8 (EAN-8).';
        }

        return self::normalise($raw) === null ? 'That barcode\'s last digit does not check out. Type the first 12 (or 7) digits and the check digit is added.' : null;
    }

    /** The check digit for the first 12 (EAN-13) or 7 (EAN-8) digits. */
    public static function checkDigit(string $digits): string
    {
        $sum = 0;
        $n = strlen($digits);
        // Weights 3,1,3,… from the right-hand end.
        for ($i = 0; $i < $n; $i++) {
            $weight = (($n - $i) % 2 === 1) ? 3 : 1;
            $sum += (int) $digits[$i] * $weight;
        }

        return (string) ((10 - $sum % 10) % 10);
    }

    /** "1" and "0" modules, guards included: 95 for EAN-13, 67 for EAN-8. */
    public static function modules(string $code): string
    {
        if (strlen($code) === 8) {
            $out = '101';
            for ($i = 0; $i < 4; $i++) {
                $out .= self::L[(int) $code[$i]];
            }
            $out .= '01010';
            for ($i = 4; $i < 8; $i++) {
                $out .= self::R[(int) $code[$i]];
            }

            return $out . '101';
        }
        $parity = self::PARITY[(int) $code[0]];
        $out = '101';
        for ($i = 1; $i <= 6; $i++) {
            $out .= $parity[$i - 1] === 'G' ? self::G[(int) $code[$i]] : self::L[(int) $code[$i]];
        }
        $out .= '01010';
        for ($i = 7; $i <= 12; $i++) {
            $out .= self::R[(int) $code[$i]];
        }

        return $out . '101';
    }

    /** The bars as an SVG data URI, $wMm wide and $hMm tall, with a quiet zone either side. */
    public static function svgDataUri(string $code, float $wMm, float $hMm): string
    {
        $modules = self::modules($code);
        $n = strlen($modules);
        $quiet = 7; // modules of white either side, as the standard asks
        $total = $n + 2 * $quiet;
        $rects = '';
        $i = 0;
        while ($i < $n) {
            if ($modules[$i] === '1') {
                $start = $i;
                while ($i < $n && $modules[$i] === '1') {
                    $i++;
                }
                $rects .= sprintf('<rect x="%d" y="0" width="%d" height="100"/>', $quiet + $start, $i - $start);
            } else {
                $i++;
            }
        }
        $svg = sprintf(
            '<svg xmlns="http://www.w3.org/2000/svg" width="%smm" height="%smm" viewBox="0 0 %d 100" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="%d" height="100" fill="#fff"/><g fill="#000">%s</g></svg>',
            rtrim(rtrim(number_format($wMm, 3, '.', ''), '0'), '.'),
            rtrim(rtrim(number_format($hMm, 3, '.', ''), '0'), '.'),
            $total,
            $total,
            $rects,
        );

        return 'data:image/svg+xml;base64,' . base64_encode($svg);
    }

    /** "5 901234 123457": the digits spaced as they print under the bars. */
    public static function text(string $code): string
    {
        if (strlen($code) === 8) {
            return substr($code, 0, 4) . ' ' . substr($code, 4);
        }

        return $code[0] . ' ' . substr($code, 1, 6) . ' ' . substr($code, 7);
    }
}
