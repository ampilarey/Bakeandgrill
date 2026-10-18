<?php

declare(strict_types=1);

namespace App\Domains\Cards;

/**
 * What a printed card looks like: its size, design and words (owner, 2026-10-18: a
 * Matica 210 card printer, "should not limit to a specific card brand").
 *
 * Every card printer prints a PDF whose page is the card, so the size is all that ties a
 * design to a printer: CR80 is the ID-1 card of ISO/IEC 7810 that Matica, Evolis, Zebra,
 * Fargo, Magicard and the rest take, and a typed size covers anything else. The admin
 * mirrors SIZES, TEMPLATES and ACCENTS in `cardSpec.ts`.
 */
final class CardSpec
{
    /** key => [label, width mm, height mm] in landscape. */
    public const SIZES = [
        'cr80' => ['CR80 (bank card)', 85.6, 53.98],
        'cr79' => ['CR79 (adhesive back)', 83.9, 52.1],
        'cr100' => ['CR100 (oversized)', 98.5, 67.0],
        'business' => ['Business card', 85.0, 55.0],
    ];

    public const TEMPLATES = ['classic', 'photo', 'minimal', 'stamp'];

    /**
     * key => [background, ink, soft ink, chip background, chip ink], every one a colour of
     * docs/brand/PALETTE.md: rust #B74B0C, dark brown #1C1408, golden amber #CA7D1C, cream
     * #F7F5F2 / #FFFDF9, the rust tint #F9F1EC, and the admin's text and border tones.
     */
    public const ACCENTS = [
        'rust' => ['#B74B0C', '#FFFDF9', '#F9F1EC', '#1C1408', '#FFFDF9'],
        'brown' => ['#1C1408', '#FFFDF9', '#E8E0D8', '#B74B0C', '#FFFDF9'],
        'gold' => ['#CA7D1C', '#1C1408', '#1C1408', '#1C1408', '#FFFDF9'],
        'cream' => ['#F7F5F2', '#1C1408', '#6B5D4F', '#B74B0C', '#FFFDF9'],
    ];

    /** The brand accent: badges, the stamp that is free, the strip on every back (PALETTE.md: badges are solid rust). */
    public const RUST = '#B74B0C';

    public const KINDS = ['discount', 'gift', 'promo', 'loyalty', 'plain'];

    public const MIN_MM = 30.0;

    public const MAX_MM = 140.0;

    /** @return array<string, mixed> */
    public static function defaults(string $kind = 'discount'): array
    {
        $kind = in_array($kind, self::KINDS, true) ? $kind : 'discount';

        return [
            'kind' => $kind,
            'template' => $kind === 'loyalty' ? 'stamp' : 'classic',
            'size' => 'cr80',
            'w' => 85.6,
            'h' => 53.98,
            'orientation' => 'landscape',
            'accent' => $kind === 'gift' ? 'brown' : 'rust',
            'lang' => 'en',
            'title' => match ($kind) {
                'gift' => 'Gift card',
                'promo' => 'Special offer',
                'loyalty' => 'Loyalty card',
                'plain' => '',
                default => 'Discount card',
            },
            'title_dv' => '',
            'headline' => '',
            'headline_dv' => '',
            'note' => $kind === 'loyalty' ? '' : 'Show this card when you order, or scan to order online.',
            'note_dv' => '',
            'photo' => '',
            'photo_dim' => 45,
            'show_logo' => true,
            'show_qr' => $kind !== 'plain' && $kind !== 'loyalty',
            'show_code' => $kind !== 'plain' && $kind !== 'loyalty',
            'show_expiry' => true,
            'show_number' => false,
            'back' => true,
            'back_title' => $kind === 'loyalty' ? 'Collect a stamp with every visit' : 'Terms',
            'back_title_dv' => '',
            'back_text' => match ($kind) {
                'gift' => "Use at the counter or online until the balance runs out.\nNot exchangeable for cash. Keep it safe: anyone holding the code can spend it.",
                'loyalty' => '',
                default => "One card per order. Cannot be combined with other cards.\nNot exchangeable for cash.",
            },
            'back_text_dv' => '',
            'back_contact' => true,
            'stamps' => $kind === 'loyalty' ? 10 : 0,
            'stamp_reward' => $kind === 'loyalty' ? 'Your 10th one is on us' : '',
            'stamp_reward_dv' => '',
        ];
    }

    /**
     * A design's settings made safe: unknown keys dropped, every value in range.
     *
     * @param array<string, mixed> $in
     * @return array<string, mixed>
     */
    public static function clean(array $in): array
    {
        $d = self::defaults((string) ($in['kind'] ?? 'discount'));
        $out = $d;

        $out['template'] = in_array($in['template'] ?? null, self::TEMPLATES, true) ? $in['template'] : $d['template'];
        $out['accent'] = isset(self::ACCENTS[$in['accent'] ?? '']) ? $in['accent'] : $d['accent'];
        $out['lang'] = in_array($in['lang'] ?? null, ['en', 'dv', 'both'], true) ? $in['lang'] : 'en';
        $out['orientation'] = ($in['orientation'] ?? '') === 'portrait' ? 'portrait' : 'landscape';

        $size = (string) ($in['size'] ?? 'cr80');
        if ($size === 'custom') {
            $out['size'] = 'custom';
            $out['w'] = self::mm($in['w'] ?? 85.6);
            $out['h'] = self::mm($in['h'] ?? 53.98);
            if ($out['h'] > $out['w']) {
                [$out['w'], $out['h']] = [$out['h'], $out['w']];
            }
        } else {
            $size = isset(self::SIZES[$size]) ? $size : 'cr80';
            $out['size'] = $size;
            $out['w'] = self::SIZES[$size][1];
            $out['h'] = self::SIZES[$size][2];
        }

        foreach (['title' => 40, 'title_dv' => 40, 'headline' => 30, 'headline_dv' => 30, 'note' => 90, 'note_dv' => 90,
            'back_title' => 50, 'back_title_dv' => 50, 'stamp_reward' => 50, 'stamp_reward_dv' => 50] as $k => $max) {
            if (array_key_exists($k, $in)) {
                $out[$k] = self::line($in[$k], $max);
            }
        }
        foreach (['back_text', 'back_text_dv'] as $k) {
            if (array_key_exists($k, $in)) {
                $out[$k] = self::lines($in[$k], 4, 120);
            }
        }
        foreach (['show_logo', 'show_qr', 'show_code', 'show_expiry', 'show_number', 'back', 'back_contact'] as $k) {
            if (array_key_exists($k, $in)) {
                $out[$k] = filter_var($in[$k], FILTER_VALIDATE_BOOLEAN);
            }
        }
        $out['photo_dim'] = max(0, min(85, (int) ($in['photo_dim'] ?? $d['photo_dim'])));
        $out['stamps'] = $out['template'] === 'stamp' ? max(4, min(12, (int) ($in['stamps'] ?? ($d['stamps'] ?: 10)))) : 0;

        $photo = trim((string) ($in['photo'] ?? ''));
        $out['photo'] = self::localImage($photo) !== null ? $photo : '';

        return $out;
    }

    /** The card's page in mm, as it prints: [width, height]. */
    public static function page(array $spec): array
    {
        return $spec['orientation'] === 'portrait' ? [$spec['h'], $spec['w']] : [$spec['w'], $spec['h']];
    }

    /** An uploaded or shipped picture as a file on disk, or null (dompdf reads no remote files). */
    public static function localImage(string $url): ?string
    {
        if ($url === '' || !preg_match('#^/(storage|brand|images)/[A-Za-z0-9_\-./]+\.(png|jpe?g|webp)$#i', $url) || str_contains($url, '..')) {
            return null;
        }
        $path = public_path(ltrim($url, '/'));

        return is_file($path) ? $path : null;
    }

    private static function mm(mixed $v): float
    {
        return round(max(self::MIN_MM, min(self::MAX_MM, (float) $v)), 2);
    }

    private static function line(mixed $v, int $max): string
    {
        $s = trim(preg_replace('/\s+/u', ' ', (string) $v) ?? '');

        return mb_substr($s, 0, $max);
    }

    private static function lines(mixed $v, int $maxLines, int $max): string
    {
        $rows = preg_split('/\R/u', (string) $v) ?: [];
        $rows = array_values(array_filter(array_map(fn ($r) => self::line($r, $max), $rows), fn ($r) => $r !== ''));

        return implode("\n", array_slice($rows, 0, $maxLines));
    }
}
