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
            $out[] = [
                'id' => $id,
                'name' => mb_substr(trim((string) ($row['name'] ?? '')), 0, self::NAME_MAX),
                'shape' => $shape,
                'preset' => $preset,
                'on' => $on,
                'w' => $w,
                'h' => $h,
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
}
