<?php

declare(strict_types=1);

namespace App\Domains\Posters;

/**
 * The checks a poster has to pass before a file is made (docs/POSTER_PLAN.md
 * § 8). Red blocks the export. Amber warns and still prints.
 */
final class PosterPreflight
{
    public const MATERIALS = [
        'foam' => ['label' => 'Foam board', 'white' => false, 'mirror' => false],
        'vinyl' => ['label' => 'Vinyl', 'white' => false, 'mirror' => false],
        'paper' => ['label' => 'Paper', 'white' => false, 'mirror' => false],
        'white_acrylic' => ['label' => 'White acrylic', 'white' => false, 'mirror' => false],
        'clear' => ['label' => 'Clear acrylic', 'white' => true, 'mirror' => false],
        'pvc' => ['label' => 'PVC board', 'white' => false, 'mirror' => false],
        'acp' => ['label' => 'Aluminium composite', 'white' => true, 'mirror' => false],
        'window_vinyl' => ['label' => 'Window vinyl', 'white' => true, 'mirror' => true],
        'sticker' => ['label' => 'Self-adhesive vinyl', 'white' => false, 'mirror' => false],
    ];

    /**
     * @param array<string, mixed> $poster
     * @param array<string, mixed> $content
     * @param array<string, mixed> $built from PosterPieces::build
     * @param array<string, mixed> $job material, white, mounting, sizes
     * @return list<array{id: string, level: string, message: string}>
     */
    public static function check(array $poster, array $content, array $built, PaperSize $size, array $job = []): array
    {
        $checks = [];
        $flags = is_array($built['flags'] ?? null) ? $built['flags'] : [];
        $pieces = is_array($built['pieces'] ?? null) ? $built['pieces'] : [];
        $mood = PosterMoods::get((string) ($poster['mood'] ?? 'dark'));

        $photo = null;
        foreach ($pieces as $piece) {
            if (($piece['type'] ?? '') === 'photo') {
                $photo = $piece;
                break;
            }
        }
        if ($photo !== null && is_string($photo['path'] ?? null) && is_file($photo['path'])) {
            $info = @getimagesize($photo['path']);
            $ppi = is_array($info) ? min($info[0] / max(0.1, $photo['w'] / 25.4), $info[1] / max(0.1, $photo['h'] / 25.4)) : 0;
            if ($ppi < PaperSize::PPI_RED) {
                $checks[] = self::row('photo', 'red', 'The photo is under 100 ppi on this size (' . (int) $ppi . ').');
            } elseif ($ppi < $size->amberPpi()) {
                $checks[] = self::row('photo', 'amber', 'The photo is under ' . $size->amberPpi() . ' ppi (' . (int) $ppi . '). Fine up close, soft from the street.');
            } else {
                $checks[] = self::row('photo', 'ok', 'Photo is ' . (int) $ppi . ' ppi.');
            }
            if (($mood['photo'] ?? false) && ($photo['bleed'] ?? false) !== true) {
                $checks[] = self::row('bleed', 'red', 'The photo stops at the trim. It needs to run to the bleed.');
            }
            if (($content['photo_source'] ?? null) === 'crop') {
                $checks[] = self::row('photo', 'red', 'This dish only has its small website photo. Upload a poster photo, or upload the dish photo again on the menu so its full-size original is kept.');
            }
        } elseif (($mood['photo'] ?? false) || ($poster['layout'] ?? '') === 'hero_photo') {
            $checks[] = self::row('photo', 'amber', 'No photo on this one. The panel is a flat colour.');
        }

        $floor = PosterPieces::BODY_FLOOR[$size->name] ?? 11;
        $smallest = null;
        $headline = null;
        foreach ($pieces as $piece) {
            if (($piece['type'] ?? '') !== 'text') {
                continue;
            }
            $pt = (float) ($piece['pt'] ?? 0);
            if ($smallest === null || $pt < $smallest) {
                $smallest = $pt;
            }
            if (($piece['font'] ?? '') === 'ds') {
                $headline = $pt;
            }
        }
        if ($smallest !== null && $smallest < $floor - 0.1) {
            $checks[] = self::row('type', 'red', 'Type is under ' . $floor . ' pt, too small to read at this size.');
        } elseif ($headline !== null && $smallest !== null && $headline < $smallest * 3) {
            $checks[] = self::row('type', 'amber', 'The headline is under three times the body type.');
        } else {
            $checks[] = self::row('type', 'ok', 'Type sizes clear the distance rule.');
        }

        if (($flags['overflow'] ?? false) === true) {
            $checks[] = self::row('fit', 'red', 'A line does not fit, even at its smallest size.');
        } elseif (($flags['shrunk'] ?? false) === true) {
            $checks[] = self::row('fit', 'amber', 'A line was shrunk to fit.');
        } else {
            $checks[] = self::row('fit', 'ok', 'Everything fits.');
        }

        if (($flags['missing_dv'] ?? false) === true) {
            $checks[] = self::row('language', 'amber', 'Both languages is on, and a line has no Dhivehi twin.');
        }

        [$safeX, $safeY, $safeW, $safeH] = $size->safeBox();
        $outside = false;
        $qrSmall = false;
        $qrAmber = false;
        foreach ($pieces as $piece) {
            $type = (string) ($piece['type'] ?? '');
            if (!in_array($type, ['text', 'qr', 'logo'], true)) {
                continue;
            }
            $x = (float) $piece['x'];
            $y = (float) $piece['y'];
            $w = (float) $piece['w'];
            $h = (float) $piece['h'];
            if ($x < $safeX - 0.5 || $y < $safeY - 0.5 || $x + $w > $safeX + $safeW + 0.5 || $y + $h > $safeY + $safeH + 0.5) {
                $outside = true;
            }
            if ($type === 'qr') {
                if ($w < 20) {
                    $qrSmall = true;
                } elseif ($w < 30 && in_array($size->name, ['A3', 'A2'], true)) {
                    $qrAmber = true;
                }
            }
        }
        $checks[] = $outside
            ? self::row('safe', 'red', 'Text, the logo or the QR sits outside the safe zone.')
            : self::row('safe', 'ok', 'Text, logo and QR are inside the safe zone.');
        if ($qrSmall) {
            $checks[] = self::row('qr', 'red', 'A QR is under 20 mm.');
        } elseif ($qrAmber) {
            $checks[] = self::row('qr', 'amber', 'A QR is under 30 mm on a large poster.');
        } else {
            $checks[] = self::row('qr', 'ok', 'QR size is fine.');
        }

        $ratio = self::contrast($mood['text'], $mood['bg']);
        if ($ratio < 4.5) {
            $checks[] = self::row('contrast', 'red', 'Text contrast is under 4.5 : 1.');
        } elseif ($ratio < 7 && $size->name === 'A2') {
            $checks[] = self::row('contrast', 'amber', 'Contrast is under 7 : 1 for a window poster.');
        } else {
            $checks[] = self::row('contrast', 'ok', 'Contrast is ' . number_format($ratio, 1) . ' : 1.');
        }

        $ink = 0.0;
        foreach ([$mood['bg'], $mood['text'], $mood['accent'], BrandCmyk::RICH_BLACK] as $cmyk) {
            $ink = max($ink, array_sum($cmyk));
        }
        if ($ink > 300) {
            $checks[] = self::row('ink', 'red', 'A colour is over 300% total ink.');
        } elseif ($ink > 280) {
            $checks[] = self::row('ink', 'amber', 'A colour is over 280% total ink.');
        } else {
            $checks[] = self::row('ink', 'ok', 'Total ink stays under 280%.');
        }

        foreach ($content['problems'] ?? [] as $message) {
            $checks[] = self::row('data', 'red', (string) $message);
        }
        foreach ($content['warnings'] ?? [] as $message) {
            $checks[] = self::row('data', 'amber', (string) $message);
        }
        $live = (string) ($content['price_live'] ?? '');
        $printed = (string) ($content['price'] ?? '');
        if ($live !== '' && $printed !== '' && !str_contains($printed, preg_replace('/From /', '', $live) ?: $live)) {
            $checks[] = self::row('price', 'red', 'The printed price does not match the live price (' . $live . ').');
        } elseif ($live !== '') {
            $checks[] = self::row('price', 'ok', 'The price matches the menu.');
        }

        $material = (string) ($job['material'] ?? 'foam');
        $needsWhite = (bool) (self::MATERIALS[$material]['white'] ?? false);
        $white = strtolower(trim((string) ($job['white'] ?? '')));
        if ($needsWhite && ($white === '' || $white === 'none')) {
            $checks[] = self::row('white', 'red', 'Clear material needs a white-ink instruction.');
        } elseif ($needsWhite) {
            $checks[] = self::row('white', 'ok', 'White ink: ' . $job['white'] . '.');
        }

        $mounting = (string) ($job['mounting'] ?? 'none');
        if (in_array($mounting, ['standoffs', 'eyelets'], true)) {
            // A circle at each corner for the stand-off or eyelet (docs/POSTER_PLAN.md § 3):
            // 15 mm across (20 mm on A2), centred that far in from the cut.
            $d = $size->keepOutMm();
            $r = $d / 2;
            $b = $size->bleed;
            $centres = [
                [$b + $d, $b + $d], [$b + $size->trimWidth - $d, $b + $d],
                [$b + $d, $b + $size->trimHeight - $d], [$b + $size->trimWidth - $d, $b + $size->trimHeight - $d],
            ];
            $hit = false;
            foreach ($pieces as $piece) {
                if (!in_array((string) ($piece['type'] ?? ''), ['text', 'qr', 'logo'], true)) {
                    continue;
                }
                foreach ($centres as [$cx, $cy]) {
                    $nx = max((float) $piece['x'], min($cx, (float) $piece['x'] + (float) $piece['w']));
                    $ny = max((float) $piece['y'], min($cy, (float) $piece['y'] + (float) $piece['h']));
                    if (($nx - $cx) ** 2 + ($ny - $cy) ** 2 < $r * $r) {
                        $hit = true;
                    }
                }
            }
            $what = $mounting === 'standoffs' ? 'stand-off' : 'eyelet';
            $checks[] = $hit
                ? self::row('keepout', 'red', 'Text, the logo or the QR sits where a corner ' . $what . ' goes.')
                : self::row('keepout', 'ok', 'The corners are clear for the ' . $what . 's.');
        }

        if (($job['layers'] ?? 'masks') === 'spots') {
            $whiteName = trim((string) ($job['white_name'] ?? ''));
            $glossOn = strtolower(trim((string) ($job['gloss'] ?? 'none'))) !== 'none';
            $glossName = trim((string) ($job['gloss_name'] ?? ''));
            if ($whiteName === '' || ($glossOn && $glossName === '')) {
                $checks[] = self::row('spots', 'red', 'This shop wants spot layers, and a layer name is missing.');
            } elseif (!self::spotNameOk($whiteName) || ($glossOn && !self::spotNameOk($glossName))) {
                $checks[] = self::row('spots', 'red', 'A spot name has to be letters, numbers and spaces, like White or Spot UV.');
            } else {
                $checks[] = self::row('spots', 'ok', 'Spot layers: ' . $whiteName . ($glossOn ? ' and ' . $glossName : '') . '.');
            }
        }

        return $checks;
    }

    public static function blocked(array $checks): bool
    {
        foreach ($checks as $check) {
            if (($check['level'] ?? '') === 'red') {
                return true;
            }
        }

        return false;
    }

    private static function spotNameOk(string $name): bool
    {
        return (bool) preg_match('/^[A-Za-z0-9][A-Za-z0-9 _-]{0,31}$/', $name);
    }

    /** @return array{id: string, level: string, message: string} */
    private static function row(string $id, string $level, string $message): array
    {
        return ['id' => $id, 'level' => $level, 'message' => $message];
    }

    /**
     * @param array{0: float, 1: float, 2: float, 3: float} $a
     * @param array{0: float, 1: float, 2: float, 3: float} $b
     */
    private static function contrast(array $a, array $b): float
    {
        $l1 = self::luminance(self::toRgb($a));
        $l2 = self::luminance(self::toRgb($b));

        return (max($l1, $l2) + 0.05) / (min($l1, $l2) + 0.05);
    }

    /** @param array{0: float, 1: float, 2: float, 3: float} $cmyk @return array{0: float, 1: float, 2: float} */
    private static function toRgb(array $cmyk): array
    {
        $c = $cmyk[0] / 100;
        $m = $cmyk[1] / 100;
        $y = $cmyk[2] / 100;
        $k = $cmyk[3] / 100;

        return [255 * (1 - $c) * (1 - $k), 255 * (1 - $m) * (1 - $k), 255 * (1 - $y) * (1 - $k)];
    }

    /** @param array{0: float, 1: float, 2: float} $rgb */
    private static function luminance(array $rgb): float
    {
        $f = static function (float $v): float {
            $v /= 255;

            return $v <= 0.03928 ? $v / 12.92 : (($v + 0.055) / 1.055) ** 2.4;
        };

        return 0.2126 * $f($rgb[0]) + 0.7152 * $f($rgb[1]) + 0.0722 * $f($rgb[2]);
    }
}
