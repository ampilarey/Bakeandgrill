<?php

declare(strict_types=1);

namespace App\Domains\Signage\Services;

/**
 * A screen's look, as stored on a group or a screen and merged for the board.
 *
 * The presets and their knob defaults live in the shared renderer
 * (`packages/shared/src/signage/layout.ts`), which is what draws the
 * slides; the server only validates what admin saves and layers the
 * group's bag under the screen's. One rule mirrors the renderer: a screen
 * that names a different preset from its group starts from that preset's
 * defaults, not from the group's knobs.
 */
final class SignageLayout
{
    public const PRESETS = ['classic', 'photo_grid', 'magazine', 'price_board', 'portrait'];

    public const CARD_STYLES = ['split', 'stack'];

    /** @return array<string, mixed> Validation rules for a `layout` request field. */
    public static function rules(string $field = 'layout'): array
    {
        return [
            $field => 'nullable|array',
            $field . '.preset' => 'nullable|string|in:' . implode(',', self::PRESETS),
            $field . '.columns' => 'nullable|integer|min:1|max:4',
            $field . '.rows_per_slide' => 'nullable|integer|min:1|max:40',
            $field . '.show_thumbs' => 'nullable|boolean',
            $field . '.showcase_cap' => 'nullable|integer|min:0|max:30',
            $field . '.card_style' => 'nullable|string|in:' . implode(',', self::CARD_STYLES),
            $field . '.category_ids' => 'nullable|array',
            $field . '.category_ids.*' => 'integer|min:1',
            $field . '.dhivehi_first' => 'nullable|boolean',
            // Day parts: windows of the day with their own categories (and preset).
            $field . '.dayparts' => 'nullable|array|max:12',
            $field . '.dayparts.*.id' => 'nullable|string|max:40',
            // A blank label is dropped by clean(), not refused — the panel adds
            // an empty row before the owner has typed anything.
            $field . '.dayparts.*.label' => 'nullable|string|max:60',
            $field . '.dayparts.*.category_ids' => 'nullable|array',
            $field . '.dayparts.*.category_ids.*' => 'integer|min:1',
            $field . '.dayparts.*.preset' => 'nullable|string|in:' . implode(',', self::PRESETS),
            $field . '.dayparts.*.schedule' => 'nullable|array',
            $field . '.dayparts.*.schedule.days' => 'nullable|array',
            $field . '.dayparts.*.schedule.days.*' => 'integer|min:0|max:6',
            $field . '.dayparts.*.schedule.windows' => 'nullable|array|max:4',
            $field . '.dayparts.*.schedule.windows.*.start' => 'required|date_format:H:i',
            $field . '.dayparts.*.schedule.windows.*.end' => 'required|date_format:H:i',
            // Sleep: off at closing, on before opening.
            $field . '.sleep' => 'nullable|array',
            $field . '.sleep.enabled' => 'nullable|boolean',
            $field . '.sleep.off' => 'nullable|date_format:H:i',
            $field . '.sleep.on' => 'nullable|date_format:H:i',
            $field . '.sleep.days' => 'nullable|array',
            $field . '.sleep.days.*' => 'integer|min:0|max:6',
        ];
    }

    /**
     * Keep only the known keys with a value; an empty bag becomes null so
     * "no look set" stays distinguishable from "look with nothing in it".
     *
     * @return array<string, mixed>|null
     */
    public static function clean(mixed $layout): ?array
    {
        if (!is_array($layout)) {
            return null;
        }
        $out = [];
        foreach (['preset', 'columns', 'rows_per_slide', 'show_thumbs', 'showcase_cap', 'card_style', 'category_ids', 'dhivehi_first', 'dayparts', 'sleep'] as $key) {
            if (array_key_exists($key, $layout) && $layout[$key] !== null && $layout[$key] !== '') {
                $out[$key] = $layout[$key];
            }
        }
        if (isset($out['category_ids']) && is_array($out['category_ids'])) {
            $out['category_ids'] = array_values(array_map('intval', $out['category_ids']));
        }
        if (isset($out['dayparts']) && is_array($out['dayparts'])) {
            $out['dayparts'] = array_values(array_filter(array_map(static function ($dp) {
                if (!is_array($dp) || trim((string) ($dp['label'] ?? '')) === '') {
                    return null;
                }
                $dp['category_ids'] = array_values(array_map('intval', is_array($dp['category_ids'] ?? null) ? $dp['category_ids'] : []));
                if (($dp['preset'] ?? null) === '' || ($dp['preset'] ?? null) === null) {
                    unset($dp['preset']);
                }

                return $dp;
            }, $out['dayparts'])));
            if ($out['dayparts'] === []) {
                unset($out['dayparts']);
            }
        }
        if (isset($out['sleep']) && is_array($out['sleep']) && empty($out['sleep']['enabled']) && empty($out['sleep']['off']) && empty($out['sleep']['on'])) {
            unset($out['sleep']);
        }

        return $out === [] ? null : $out;
    }

    /**
     * Group under screen. Null when neither says anything, so the board
     * keeps the playlist's own auto-menu settings.
     *
     * @return array<string, mixed>|null
     */
    public static function merge(mixed $group, mixed $screen): ?array
    {
        $g = self::clean($group) ?? [];
        $s = self::clean($screen) ?? [];
        if ($g === [] && $s === []) {
            return null;
        }
        if (isset($s['preset']) && isset($g['preset']) && $s['preset'] !== $g['preset']) {
            // The screen chose its own look; the group's knobs belong to another preset.
            $g = ['preset' => $g['preset']];
        }

        return array_merge($g, $s);
    }
}
