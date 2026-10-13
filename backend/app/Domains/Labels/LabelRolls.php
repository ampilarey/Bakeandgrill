<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use InvalidArgumentException;

/**
 * The label rolls and sheets the business actually owns (round 6 of the
 * usability work, owner, 2026-10-13: "only the sizes you own"), kept as one
 * JSON setting (`label_rolls`, Labels → Settings → My label rolls). Each is a
 * size choice as the Admin's picker holds it (shape, a preset or a typed
 * size, the stock it prints on) with a name of the owner's ("Big roll");
 * every size picker shows them first and the rest under More sizes.
 */
final class LabelRolls
{
    public const KEY = 'label_rolls';

    public const MAX = 20;

    public const STOCKS = ['sheet', 'precut', 'landscape', 'printer'];

    public const NAME_MAX = 40;

    /** @return list<array{id: string, name: string, shape: string, preset: string, on: string, w: float, h: float}> */
    public static function all(): array
    {
        return self::normalise(LabelSettings::get(self::KEY));
    }

    /**
     * Tidy a list (or its JSON): a roll on an unknown preset, a shape that does
     * not match it, or a typed size the sheet cannot print is dropped; a stock
     * the size does not offer falls back to its first; names are trimmed; at
     * most MAX rolls, each id once.
     *
     * @return list<array{id: string, name: string, shape: string, preset: string, on: string, w: float, h: float}>
     */
    public static function normalise(mixed $raw): array
    {
        $rows = is_string($raw) ? json_decode($raw, true) : $raw;
        if (!is_array($rows)) {
            return [];
        }
        $presets = array_column(StickerLayouts::PRESETS, null, 'id');
        $out = [];
        $seen = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $shape = ($row['shape'] ?? '') === 'circle' ? 'circle' : 'rect';
            $preset = trim((string) ($row['preset'] ?? 'custom')) ?: 'custom';
            $on = in_array($row['on'] ?? '', self::STOCKS, true) ? (string) $row['on'] : 'sheet';
            if ($preset !== 'custom') {
                $p = $presets[$preset] ?? null;
                if ($p === null || $p['shape'] !== $shape) {
                    continue;
                }
                if (!isset($p['on'][$on])) {
                    $on = (string) array_key_first($p['on']);
                }
                $w = (float) $p['w'];
                $h = (float) $p['h'];
            } else {
                $w = round((float) ($row['w'] ?? 0), 1);
                $h = $shape === 'circle' ? $w : round((float) ($row['h'] ?? 0), 1);
                // A typed size prints on plain A4 or a label printer; the server has the last word on whether it fits.
                $on = $on === 'printer' ? 'printer' : 'sheet';
                $layout = $shape === 'circle' ? ($on === 'printer' ? 'single-round-custom' : 'a4-round-custom') : ($on === 'printer' ? 'single-custom' : 'a4-custom');
                try {
                    StickerLayouts::resolve($layout, $w, $shape === 'circle' ? null : $h);
                } catch (InvalidArgumentException) {
                    continue;
                }
            }
            $id = (string) preg_replace('/[^a-zA-Z0-9_-]/', '', (string) ($row['id'] ?? ''));
            if ($id === '') {
                $id = 'roll-' . bin2hex(random_bytes(4));
            }
            if (isset($seen[$id])) {
                continue;
            }
            $seen[$id] = true;
            // Label stock (round 13): how many are left (labels on a printer
            // roll, sheets otherwise), the level that warns, and when the owners
            // were told; the telling is forgotten once the roll is above the level again.
            $left = isset($row['left']) && $row['left'] !== '' && is_numeric($row['left']) ? max(0, (int) round((float) $row['left'])) : null;
            $low = isset($row['low']) && $row['low'] !== '' && is_numeric($row['low']) ? max(0, (int) round((float) $row['low'])) : null;
            $alerted = isset($row['low_alerted_at']) && is_string($row['low_alerted_at']) && trim($row['low_alerted_at']) !== '' ? trim($row['low_alerted_at']) : null;
            if ($left === null || $low === null || $left > $low) {
                $alerted = null;
            }
            $out[] = [
                'id' => $id,
                'name' => mb_substr(trim((string) ($row['name'] ?? '')), 0, self::NAME_MAX),
                'shape' => $shape,
                'preset' => $preset,
                'on' => $on,
                'w' => $w,
                'h' => $h,
                'left' => $left,
                'low' => $low,
                'low_alerted_at' => $alerted,
            ];
            if (count($out) >= self::MAX) {
                break;
            }
        }

        return $out;
    }

    /** The list as the setting stores it: JSON, or nothing for none. */
    public static function encode(array $rolls): string
    {
        return $rolls === [] ? '' : (string) json_encode(array_values($rolls), JSON_UNESCAPED_UNICODE);
    }

    /** What a roll counts in: labels off a printer roll, sheets off a sheet stock. */
    public static function unit(array $roll): string
    {
        return ($roll['on'] ?? '') === 'printer' ? 'labels' : 'sheets';
    }

    /**
     * A roll as the pickers see it (round 13): with its unit, whether it is
     * at or under its warning level, and whether it is out.
     *
     * @param array<string, mixed> $roll
     * @return array<string, mixed>
     */
    public static function present(array $roll): array
    {
        $left = $roll['left'] ?? null;
        $low = $roll['low'] ?? null;

        return $roll + [
            'unit' => self::unit($roll),
            'low_now' => $left !== null && $low !== null && $left <= $low,
            'out' => $left !== null && $left <= 0,
        ];
    }

    /** @return list<array<string, mixed>> */
    public static function presentAll(): array
    {
        return array_map([self::class, 'present'], self::all());
    }

    /** Whether a roll prints exactly this layout and size. */
    public static function sameSize(array $roll, string $layout, ?float $w, ?float $h): bool
    {
        $r = self::request($roll);
        $near = fn (?float $a, ?float $b): bool => ($a === null && $b === null) || ($a !== null && $b !== null && abs($a - $b) < 0.05);

        return $r['layout'] === $layout && $near($r['w'], $w) && $near($r['h'], $h);
    }

    /**
     * Count a print off the roll it used (round 13 of the usability work,
     * owner, 2026-10-13: "how many labels are left on each roll, with a
     * warning when low"): the roll the request names, else the first roll of
     * that very layout and size; labels off a printer roll, sheets off a
     * sheet stock, never below none. A roll that is not counted (no number
     * typed in) is left alone. When the count reaches the warning level the
     * owners are told once (RollStockAlert), and told again only after the
     * roll has been counted up above the level. Returns the roll as it now
     * stands with what this print took, or null when no roll was used.
     *
     * @param array<string, mixed> $req from StickerSheet::normalise()
     * @param array<string, mixed> $summary from StickerSheet::summary()
     * @return ?array<string, mixed>
     */
    public static function consume(array $req, array $summary): ?array
    {
        $rolls = self::all();
        $index = null;
        $wanted = (string) ($req['roll'] ?? '');
        if ($wanted !== '') {
            foreach ($rolls as $i => $roll) {
                if ($roll['id'] === $wanted) {
                    $index = $i;
                    break;
                }
            }
        }
        if ($index === null) {
            foreach ($rolls as $i => $roll) {
                if (self::sameSize($roll, (string) $req['layout'], $req['w'] ?? null, $req['h'] ?? null)) {
                    $index = $i;
                    break;
                }
            }
        }
        if ($index === null) {
            return null;
        }
        $roll = $rolls[$index];
        $took = $roll['on'] === 'printer' ? (int) ($summary['stickers'] ?? 0) : (int) ($summary['pages'] ?? 0);
        if ($roll['left'] !== null) {
            $roll['left'] = max(0, (int) $roll['left'] - $took);
            if ($roll['low'] !== null && $roll['left'] <= $roll['low'] && $roll['low_alerted_at'] === null && RollStockAlert::send($roll)) {
                $roll['low_alerted_at'] = now()->toIso8601String();
            }
            $rolls[$index] = $roll;
            LabelSettings::save([self::KEY => self::encode($rolls)]);
        }

        return self::present($roll) + ['took' => $took];
    }

    /** @return ?array{id: string, name: string, shape: string, preset: string, on: string, w: float, h: float} */
    public static function find(string $id): ?array
    {
        foreach (self::all() as $roll) {
            if ($roll['id'] === $id) {
                return $roll;
            }
        }

        return null;
    }

    /**
     * The sticker request a roll stands for: the layout its stock prints on,
     * and the size where that layout takes one.
     *
     * @param array{shape: string, preset: string, on: string, w: float, h: float} $roll
     * @return array{layout: string, w: ?float, h: ?float}
     */
    public static function request(array $roll): array
    {
        $presets = array_column(StickerLayouts::PRESETS, null, 'id');
        $p = $roll['preset'] !== 'custom' ? ($presets[$roll['preset']] ?? null) : null;
        if ($p !== null) {
            $layout = (string) ($p['on'][$roll['on']] ?? array_values($p['on'])[0]);
        } else {
            $printer = $roll['on'] === 'printer';
            $layout = $roll['shape'] === 'circle' ? ($printer ? 'single-round-custom' : 'a4-round-custom') : ($printer ? 'single-custom' : 'a4-custom');
        }
        $sized = in_array($layout, StickerLayouts::SIZED, true);

        return [
            'layout' => $layout,
            'w' => $sized ? (float) $roll['w'] : null,
            'h' => $sized && $roll['shape'] !== 'circle' ? (float) $roll['h'] : null,
        ];
    }

    /** Print when packing (round 12): which roll the kitchen screen prints on, and in which language. */
    public const KITCHEN_ROLL_KEY = 'label_kitchen_roll';

    public const KITCHEN_LANG_KEY = 'label_kitchen_lang';

    /** The kitchen's sticker when no roll is picked: 4 × 6 cm, as many to an A4 sheet as fit. */
    public const KITCHEN_DEFAULT = ['layout' => 'a4-custom', 'w' => 40.0, 'h' => 60.0];

    /**
     * What the kitchen screen prints a batch's stickers on and in (round 12,
     * 2026-10-13: "a Labels button on the kitchen board for the batch just
     * made"): the roll picked under Labels → Settings → My label rolls, or
     * the 4 × 6 cm default when none is picked or it is gone; the language
     * picked there, English unless said otherwise.
     *
     * @return array{size: array{layout: string, w: ?float, h: ?float, name: string, roll: ?string}, lang: string}
     */
    public static function kitchen(): array
    {
        $id = trim(LabelSettings::get(self::KITCHEN_ROLL_KEY));
        $roll = $id !== '' ? self::find($id) : null;
        $req = $roll !== null ? self::request($roll) : self::KITCHEN_DEFAULT;
        $lang = LabelSettings::get(self::KITCHEN_LANG_KEY);

        return [
            'size' => $req + ['name' => StickerLayouts::describe($req['layout'], $req['w'], $req['h']), 'roll' => $roll['id'] ?? null],
            'lang' => in_array($lang, StickerSheet::LANGS, true) ? $lang : 'en',
        ];
    }
}
