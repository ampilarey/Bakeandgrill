<?php

declare(strict_types=1);

namespace App\Domains\Posters;

/**
 * One layout, every size (docs/POSTER_PLAN.md § 4.2). Pieces are in
 * millimetres from the top-left of the bleed. The same list is the admin
 * preview and the print file. The middle gives way before the header and
 * the footer: list rows drop from the end, and type shrinks down to the
 * size's floor before a slot is flagged as overflow.
 */
final class PosterPieces
{
    /** Body type below these points is a red preflight (the distance rule). */
    public const BODY_FLOOR = ['A5' => 9.0, 'A4' => 11.0, 'A3' => 16.0, 'A2' => 22.0];

    /**
     * @param array<string, mixed> $poster
     * @param array<string, mixed> $content
     * @return array{w: float, h: float, background: array<int, float>, hex_bg: string, pieces: list<array<string, mixed>>, flags: array{overflow: bool, shrunk: bool, missing_dv: bool}}
     */
    public static function build(array $poster, PaperSize $size, array $content): array
    {
        $layout = (string) ($poster['layout'] ?? 'hero_photo');
        if ($layout === PosterPurposes::THEMED || ($poster['theme'] ?? null) !== null) {
            // A ready-made design is drawn from its theme, never from a layout (docs/POSTER_THEMES_HANDOFF.md).
            return PosterThemePieces::build($poster, $size, $content);
        }
        $mood = PosterMoods::get((string) ($poster['mood'] ?? 'dark'));
        $lang = (string) ($poster['language'] ?? 'both');
        $flags = ['overflow' => false, 'shrunk' => false, 'missing_dv' => false];
        [$sx, $sy, $sw, $sh] = $size->safeBox();
        $s = $size->trimWidth / 297.0;
        $floor = self::BODY_FLOOR[$size->name] ?? 11.0;

        $ctx = compact('mood', 'lang', 'content', 'size', 'flags', 'sx', 'sy', 'sw', 'sh', 's', 'floor');
        $pieces = match ($layout) {
            'price_card' => self::priceCard($ctx),
            'list' => self::list($ctx),
            'hours_grid' => self::hours($ctx),
            'qr_card' => self::qr($ctx),
            'notice' => self::notice($ctx),
            'compare' => self::compare($ctx),
            'collage' => self::collage($ctx),
            default => self::hero($ctx),
        };
        $flags = $ctx['flags'];

        if ($lang === 'both') {
            foreach (['headline', 'subhead', 'body'] as $slot) {
                $en = trim((string) ($content[$slot] ?? ''));
                $dv = trim((string) ($content[$slot . '_dv'] ?? ''));
                if ($en !== '' && $dv === '') {
                    $flags['missing_dv'] = true;
                }
            }
        }

        if ($lang === 'dv') {
            $pieces = self::mirror($pieces, $size->bleedWidth());
        }

        return [
            'w' => $size->bleedWidth(),
            'h' => $size->bleedHeight(),
            'background' => $mood['bg'],
            'hex_bg' => $mood['hex_bg'],
            'pieces' => $pieces,
            'flags' => $flags,
        ];
    }

    /**
     * @param array<string, mixed> $ctx
     * @return list<array<string, mixed>>
     */
    private static function hero(array &$ctx): array
    {
        $size = $ctx['size'];
        $mood = $ctx['mood'];
        $photoH = $size->bleedHeight() * 0.56;
        $pieces = [];
        if ($mood['photo'] && is_string($ctx['content']['photo'] ?? null)) {
            $pieces[] = self::photo(0, 0, $size->bleedWidth(), $size->bleedHeight(), $ctx['content']['photo']);
        }
        $pieces[] = self::rect(0, $photoH * 0.86, $size->bleedWidth(), $size->bleedHeight() - $photoH * 0.86, $mood['bg'], $mood['hex_bg'], true);
        $y = $ctx['sy'] + $photoH * 0.72;
        $pieces = array_merge($pieces, self::stack($ctx, $ctx['sx'], $y, $ctx['sw'], [
            ['eyebrow', 'j7', 11],
            ['headline', 'ds', 36],
            ['headline_dv', 'dvb', 16],
            ['price', 'j8', 22],
        ]));
        $pieces = array_merge($pieces, self::footer($ctx));

        return $pieces;
    }

    /** @param array<string, mixed> $ctx */
    private static function priceCard(array &$ctx): array
    {
        $pieces = [self::rect(0, 0, $ctx['size']->bleedWidth(), $ctx['size']->bleedHeight(), $ctx['mood']['bg'], $ctx['mood']['hex_bg'], true)];
        $y = $ctx['sy'];
        $pieces = array_merge($pieces, self::stack($ctx, $ctx['sx'], $y, $ctx['sw'], [
            ['badge', 'j7', 12],
            ['price', 'j8', 54],
            ['headline', 'ds', 28],
            ['headline_dv', 'dvb', 14],
            ['subhead', 'j5', 12],
        ]));
        $pieces = array_merge($pieces, self::footer($ctx));

        return $pieces;
    }

    /** @param array<string, mixed> $ctx */
    private static function list(array &$ctx): array
    {
        $pieces = [self::rect(0, 0, $ctx['size']->bleedWidth(), $ctx['size']->bleedHeight(), $ctx['mood']['bg'], $ctx['mood']['hex_bg'], true)];
        $pieces = array_merge($pieces, self::stack($ctx, $ctx['sx'], $ctx['sy'], $ctx['sw'], [
            ['headline', 'ds', 26],
            ['headline_dv', 'dvb', 13],
        ]));
        $footerTop = $ctx['sy'] + $ctx['sh'] - 28 * $ctx['s'];
        $y = $ctx['sy'] + 28 * $ctx['s'];
        $rowH = 10 * $ctx['s'];
        $rows = is_array($ctx['content']['rows'] ?? null) ? $ctx['content']['rows'] : [];
        $room = max(0, (int) floor(($footerTop - $y) / max(1, $rowH)));
        foreach (array_slice($rows, 0, $room) as $row) {
            $pieces[] = self::line($ctx, $ctx['sx'], $y, $ctx['sw'] * 0.68, $rowH, (string) ($row['name'] ?? ''), 'j5', 11 * $ctx['s'], $ctx['mood']['text'], $ctx['mood']['hex_text'], 'left', false);
            $pieces[] = self::line($ctx, $ctx['sx'] + $ctx['sw'] * 0.68, $y, $ctx['sw'] * 0.32, $rowH, (string) ($row['price'] ?? ''), 'j7', 11 * $ctx['s'], $ctx['mood']['accent'], $ctx['mood']['hex_accent'], 'right', false);
            $y += $rowH;
        }

        return array_merge($pieces, self::footer($ctx));
    }

    /** @param array<string, mixed> $ctx */
    private static function hours(array &$ctx): array
    {
        $pieces = [self::rect(0, 0, $ctx['size']->bleedWidth(), $ctx['size']->bleedHeight(), $ctx['mood']['bg'], $ctx['mood']['hex_bg'], true)];
        $pieces = array_merge($pieces, self::stack($ctx, $ctx['sx'], $ctx['sy'], $ctx['sw'], [
            ['headline', 'ds', 26],
            ['headline_dv', 'dvb', 13],
        ]));
        $y = $ctx['sy'] + 26 * $ctx['s'];
        $rowH = max(7, ($ctx['sh'] - 60 * $ctx['s']) / 8);
        foreach (is_array($ctx['content']['hours'] ?? null) ? $ctx['content']['hours'] : [] as $row) {
            $pieces[] = self::line($ctx, $ctx['sx'], $y, $ctx['sw'] * 0.48, $rowH, (string) ($row['day'] ?? ''), 'j5', 11 * $ctx['s'], $ctx['mood']['text'], $ctx['mood']['hex_text'], 'left', false);
            $pieces[] = self::line($ctx, $ctx['sx'] + $ctx['sw'] * 0.48, $y, $ctx['sw'] * 0.52, $rowH, (string) ($row['time'] ?? ''), 'j7', 11 * $ctx['s'], $ctx['mood']['accent'], $ctx['mood']['hex_accent'], 'right', false);
            $y += $rowH;
        }
        if (trim((string) ($ctx['content']['body'] ?? '')) !== '') {
            $pieces[] = self::line($ctx, $ctx['sx'], $y, $ctx['sw'], $rowH * 2, (string) $ctx['content']['body'], 'j5', 9 * $ctx['s'], $ctx['mood']['text'], $ctx['mood']['hex_text'], 'left', false);
        }

        return array_merge($pieces, self::footer($ctx, false));
    }

    /** @param array<string, mixed> $ctx */
    private static function qr(array &$ctx): array
    {
        $pieces = [self::rect(0, 0, $ctx['size']->bleedWidth(), $ctx['size']->bleedHeight(), $ctx['mood']['bg'], $ctx['mood']['hex_bg'], true)];
        $pieces = array_merge($pieces, self::stack($ctx, $ctx['sx'], $ctx['sy'], $ctx['sw'], [
            ['headline', 'ds', 22],
            ['headline_dv', 'dvb', 12],
        ]));
        $side = max(22.0, min($ctx['sw'] * 0.55, $ctx['sh'] * 0.42));
        $pieces[] = [
            'type' => 'qr', 'x' => $ctx['sx'] + ($ctx['sw'] - $side) / 2, 'y' => $ctx['sy'] + $ctx['sh'] * 0.28,
            'w' => $side, 'h' => $side, 'url' => (string) ($ctx['content']['qr_url'] ?? ''),
        ];
        $pieces[] = self::line($ctx, $ctx['sx'], $ctx['sy'] + $ctx['sh'] * 0.28 + $side + 2, $ctx['sw'], 8, (string) ($ctx['content']['subhead'] ?? ''), 'j5', 11 * $ctx['s'], $ctx['mood']['text'], $ctx['mood']['hex_text'], 'center', false);

        return array_merge($pieces, self::footer($ctx, false));
    }

    /** @param array<string, mixed> $ctx */
    private static function notice(array &$ctx): array
    {
        $pieces = [self::rect(0, 0, $ctx['size']->bleedWidth(), $ctx['size']->bleedHeight(), $ctx['mood']['bg'], $ctx['mood']['hex_bg'], true)];
        $pieces = array_merge($pieces, self::stack($ctx, $ctx['sx'], $ctx['sy'] + $ctx['sh'] * 0.12, $ctx['sw'], [
            ['headline', 'ds', 32],
            ['headline_dv', 'dvb', 16],
            ['body', 'j5', 14],
            ['body_dv', 'dv', 12],
        ]));

        return array_merge($pieces, self::footer($ctx, false));
    }

    /** @param array<string, mixed> $ctx */
    private static function compare(array &$ctx): array
    {
        $pieces = [self::rect(0, 0, $ctx['size']->bleedWidth(), $ctx['size']->bleedHeight(), $ctx['mood']['bg'], $ctx['mood']['hex_bg'], true)];
        $pieces = array_merge($pieces, self::stack($ctx, $ctx['sx'], $ctx['sy'], $ctx['sw'], [
            ['badge', 'j7', 12],
            ['headline', 'ds', 28],
            ['headline_dv', 'dvb', 14],
        ]));
        $y = $ctx['sy'] + $ctx['sh'] * 0.38;
        $old = (string) ($ctx['content']['old_price'] ?? '');
        if ($old !== '') {
            $pieces[] = self::line($ctx, $ctx['sx'], $y, $ctx['sw'], 14, $old, 'j5', 18 * $ctx['s'], $ctx['mood']['text'], $ctx['mood']['hex_text'], 'left', false);
            $pieces[array_key_last($pieces)]['strike'] = true;
        }
        $pieces[] = self::line($ctx, $ctx['sx'], $y + 16, $ctx['sw'], 20, (string) ($ctx['content']['price'] ?? ''), 'j8', 36 * $ctx['s'], $ctx['mood']['accent'], $ctx['mood']['hex_accent'], 'left', false);
        $pieces[] = self::line($ctx, $ctx['sx'], $y + 40, $ctx['sw'], 10, (string) ($ctx['content']['subhead'] ?? ''), 'j5', 12 * $ctx['s'], $ctx['mood']['text'], $ctx['mood']['hex_text'], 'left', false);

        return array_merge($pieces, self::footer($ctx));
    }

    /** @param array<string, mixed> $ctx */
    private static function collage(array &$ctx): array
    {
        $size = $ctx['size'];
        $gap = 3.0;
        $w = ($size->bleedWidth() - $gap) / 2;
        $h = $size->bleedHeight() * 0.34;
        $pieces = [self::rect(0, 0, $size->bleedWidth(), $size->bleedHeight(), $ctx['mood']['bg'], $ctx['mood']['hex_bg'], true)];
        $photo = is_string($ctx['content']['photo'] ?? null) ? $ctx['content']['photo'] : null;
        foreach ([[0, 0], [$w + $gap, 0], [0, $h + $gap], [$w + $gap, $h + $gap]] as [$x, $y]) {
            $pieces[] = $photo !== null
                ? self::photo($x, $y, $w, $h, $photo)
                : self::rect($x, $y, $w, $h, $ctx['mood']['accent'], $ctx['mood']['hex_accent'], false);
        }
        $pieces = array_merge($pieces, self::stack($ctx, $ctx['sx'], $h * 2 + $gap + 6, $ctx['sw'], [
            ['headline', 'ds', 26],
            ['headline_dv', 'dvb', 13],
            ['price', 'j8', 18],
        ]));

        return array_merge($pieces, self::footer($ctx));
    }

    /**
     * @param array<string, mixed> $ctx
     * @param list<array{0: string, 1: string, 2: float}> $rows
     * @return list<array<string, mixed>>
     */
    private static function stack(array &$ctx, float $x, float $y, float $w, array $rows): array
    {
        $lang = $ctx['lang'];
        $pieces = [];
        foreach ($rows as [$key, $font, $base]) {
            $dv = str_ends_with($key, '_dv');
            if ($dv && $lang === 'en') {
                continue;
            }
            if (!$dv && $lang === 'dv' && trim((string) ($ctx['content'][$key . '_dv'] ?? '')) !== '') {
                continue;
            }
            $text = trim((string) ($ctx['content'][$key] ?? ''));
            if ($text === '') {
                continue;
            }
            $pt = $base * $ctx['s'] * ($dv ? 1.2 : 1);
            $h = $pt * 0.45 + 1.5;
            $color = in_array($key, ['price', 'badge'], true) ? $ctx['mood']['accent'] : $ctx['mood']['text'];
            $hex = in_array($key, ['price', 'badge'], true) ? $ctx['mood']['hex_accent'] : $ctx['mood']['hex_text'];
            $pieces[] = self::line($ctx, $x, $y, $w, $h, $text, $font, $pt, $color, $hex, 'left', $dv);
            $y += $h;
        }

        return $pieces;
    }

    /**
     * @param array<string, mixed> $ctx
     * @param array{0: float, 1: float, 2: float, 3: float} $color
     */
    private static function line(array &$ctx, float $x, float $y, float $w, float $h, string $text, string $font, float $pt, array $color, string $hex, string $align, bool $dv): array
    {
        if ($text === '') {
            return ['type' => 'skip'];
        }
        $floor = $ctx['floor'] * ($dv ? 1.2 : 1);
        $shrunk = false;
        while ($pt > $floor + 0.01 && !self::fits($text, $pt, $w)) {
            $pt -= 0.5;
            $shrunk = true;
        }
        if ($shrunk) {
            $ctx['flags']['shrunk'] = true;
        }
        if (!self::fits($text, max($pt, $floor), $w)) {
            $ctx['flags']['overflow'] = true;
        }

        return [
            'type' => 'text', 'x' => $x, 'y' => $y, 'w' => $w, 'h' => max($h, $pt * 0.45),
            'text' => $text, 'font' => $font, 'pt' => max($pt, $floor), 'cmyk' => $color,
            'hex' => $hex, 'align' => $align, 'dv' => $dv,
        ];
    }

    /** @param array<string, mixed> $ctx @return list<array<string, mixed>> */
    private static function footer(array &$ctx, bool $withGst = true): array
    {
        $qr = match ($ctx['size']->name) {
            'A5' => 22.0,
            'A4' => 26.0,
            default => 32.0,
        };
        $y = $ctx['sy'] + $ctx['sh'] - $qr;
        $logoW = min($qr * 0.9, 28.0);
        $pieces = [[
            'type' => 'logo', 'x' => $ctx['sx'], 'y' => $y, 'w' => $logoW, 'h' => min($qr, $logoW * (990 / 690)),
            'colourway' => $ctx['mood']['colourway'],
        ]];
        if ($withGst && trim((string) ($ctx['content']['gst'] ?? '')) !== '') {
            $gst = $ctx['lang'] === 'dv' && trim((string) $ctx['content']['gst_dv']) !== ''
                ? (string) $ctx['content']['gst_dv']
                : (string) $ctx['content']['gst'];
            $pieces[] = self::line($ctx, $ctx['sx'] + $logoW + 2, $y + 1, $ctx['sw'] - $logoW - $qr - 4, $qr - 2, $gst, $ctx['lang'] === 'dv' ? 'dv' : 'j5', min(9.0, $ctx['floor']), $ctx['mood']['text'], $ctx['mood']['hex_text'], 'left', $ctx['lang'] === 'dv');
        }
        $pieces[] = [
            'type' => 'qr', 'x' => $ctx['sx'] + $ctx['sw'] - $qr, 'y' => $y,
            'w' => $qr, 'h' => $qr, 'url' => (string) ($ctx['content']['qr_url'] ?? ''),
        ];

        return array_values(array_filter($pieces, static fn (array $p): bool => ($p['type'] ?? '') !== 'skip'));
    }

    /** @param array{0: float, 1: float, 2: float, 3: float} $cmyk */
    private static function rect(float $x, float $y, float $w, float $h, array $cmyk, string $hex, bool $bleed): array
    {
        return ['type' => 'rect', 'x' => $x, 'y' => $y, 'w' => $w, 'h' => $h, 'cmyk' => $cmyk, 'hex' => $hex, 'bleed' => $bleed];
    }

    private static function photo(float $x, float $y, float $w, float $h, string $path): array
    {
        return ['type' => 'photo', 'x' => $x, 'y' => $y, 'w' => $w, 'h' => $h, 'path' => $path, 'bleed' => $x <= 0 && $y <= 0];
    }

    private static function fits(string $text, float $pt, float $w): bool
    {
        $em = $pt * 0.3528 * 0.5;

        return mb_strlen($text) * $em <= max(1, $w);
    }

    /**
     * @param list<array<string, mixed>> $pieces
     * @return list<array<string, mixed>>
     */
    private static function mirror(array $pieces, float $pageW): array
    {
        foreach ($pieces as &$piece) {
            if (($piece['bleed'] ?? false) === true || ($piece['type'] ?? '') === 'skip') {
                continue;
            }
            $piece['x'] = $pageW - (float) $piece['x'] - (float) $piece['w'];
            $align = (string) ($piece['align'] ?? '');
            if ($align === 'left') {
                $piece['align'] = 'right';
            } elseif ($align === 'right') {
                $piece['align'] = 'left';
            }
        }

        return $pieces;
    }
}
