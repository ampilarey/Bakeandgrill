<?php

declare(strict_types=1);

namespace App\Domains\Labels;

/**
 * The marks a wrap-around label's Marks part carries (owner, 2026-10-12: the
 * recycling and deposit marks on a bottle label). Each is a glyph of the
 * label symbol font (LabelText 'sym', a subset of DejaVu Sans:
 * scripts/label-symbol-font.py) with a caption beneath, so the browser, the
 * PDF and the thermal bitmap all draw it; the tidy man ("dispose properly")
 * has no glyph and is drawn from a few boxes by WrapDesign. Any picture the
 * owner holds the rights to (a halal or other certification mark) goes in
 * the same row from the media library (`pictures` in WrapConfig).
 */
final class LabelMarks
{
    /**
     * key => [glyph (one character of the symbol font, '' for a drawn mark), caption, what the Admin calls it]
     *
     * @var array<string, array{0: string, 1: string, 2: string}>
     */
    public const MARKS = [
        'recycle' => ["\u{267B}", 'RECYCLE', 'Recycling loop'],
        'dispose' => ['', 'DISPOSE PROPERLY', 'Tidy man (dispose properly)'],
        'pet' => ["\u{2673}", 'PET 1', 'Plastic 1 · PET'],
        'hdpe' => ["\u{2674}", 'HDPE 2', 'Plastic 2 · HDPE'],
        'pvc' => ["\u{2675}", 'PVC 3', 'Plastic 3 · PVC'],
        'ldpe' => ["\u{2676}", 'LDPE 4', 'Plastic 4 · LDPE'],
        'pp' => ["\u{2677}", 'PP 5', 'Plastic 5 · PP'],
        'ps' => ["\u{2678}", 'PS 6', 'Plastic 6 · PS'],
        'other' => ["\u{2679}", 'OTHER 7', 'Plastic 7 · other'],
        'glass' => ["\u{267A}", 'GLASS', 'Glass'],
        'paper' => ["\u{267C}", 'PAPER', 'Recycled paper'],
        'metal' => ["\u{267A}", 'METAL', 'Metal (tin, aluminium)'],
    ];

    /** @var list<string> */
    public const KEYS = ['recycle', 'dispose', 'pet', 'hdpe', 'pvc', 'ldpe', 'pp', 'ps', 'other', 'glass', 'paper', 'metal'];

    /**
     * The marks for a label, in the order asked, unknown keys dropped.
     *
     * @param list<string> $keys
     * @return list<array{key: string, glyph: string, caption: string}>
     */
    public static function for(array $keys): array
    {
        $out = [];
        foreach ($keys as $key) {
            $key = (string) $key;
            if (!isset(self::MARKS[$key]) || isset($out[$key])) {
                continue;
            }
            [$glyph, $caption] = self::MARKS[$key];
            $out[$key] = ['key' => $key, 'glyph' => $glyph, 'caption' => $caption];
        }

        return array_values($out);
    }

    /**
     * The marks as the Admin lists them.
     *
     * @return list<array{key: string, label: string, caption: string}>
     */
    public static function catalogue(): array
    {
        $out = [];
        foreach (self::MARKS as $key => [, $caption, $label]) {
            $out[] = ['key' => $key, 'label' => $label, 'caption' => $caption];
        }

        return $out;
    }
}
