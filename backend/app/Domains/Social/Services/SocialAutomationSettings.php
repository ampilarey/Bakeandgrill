<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Models\SiteSetting;

/**
 * Settings for the social automations (plan §2c "posting policy" + rollout
 * gate). SiteSetting-backed like the other ops toggles, one key set per
 * kind: `special` (the original daily special, keys social_auto_special_*),
 * `new_item` (new on the menu) and `featured` (chef's pick), added by the
 * 2026-09-24 audit.
 *
 * `unattended` is the pilot gate: off means the automation only DRAFTS a
 * post (awaiting approval); a human with social.publish sends it. Turn it
 * on only after an observed pilot period.
 */
class SocialAutomationSettings
{
    public const KINDS = ['special', 'new_item', 'featured'];

    public const TEMPLATE_DEFAULT = "Today's special: {item} — MVR {price}\n{badge}\nOrder now: {link}";

    public const NEW_ITEM_TEMPLATE_DEFAULT = "New on the menu: {item} — MVR {price}\n{description}\nOrder now: {link}";

    public const FEATURED_TEMPLATE_DEFAULT = "Chef's pick: {item} — MVR {price}\n{description}\nOrder now: {link}";

    /** @var array<string, array{time: string, template: string}> */
    private const DEFAULTS = [
        'special' => ['time' => '11:00', 'template' => self::TEMPLATE_DEFAULT],
        'new_item' => ['time' => '16:00', 'template' => self::NEW_ITEM_TEMPLATE_DEFAULT],
        'featured' => ['time' => '12:00', 'template' => self::FEATURED_TEMPLATE_DEFAULT],
    ];

    /** The daily special's settings — the original shape, kept for callers that predate kinds. */
    public function all(): array
    {
        return $this->forKind('special');
    }

    /**
     * @return array{enabled: bool, time: string, channel_ids: list<int>, template: string, unattended: bool, days: list<int>, max_age_days: int}
     */
    public function forKind(string $kind): array
    {
        $kind = in_array($kind, self::KINDS, true) ? $kind : 'special';
        $prefix = 'social_auto_' . $kind . '_';
        $channelIds = json_decode((string) SiteSetting::get($prefix . 'channel_ids', '[]'), true);
        $days = json_decode((string) SiteSetting::get($prefix . 'days', '[0,1,2,3,4,5,6]'), true);

        return [
            'enabled' => filter_var(SiteSetting::get($prefix . 'enabled', '0'), FILTER_VALIDATE_BOOLEAN),
            'time' => (string) SiteSetting::get($prefix . 'time', self::DEFAULTS[$kind]['time']),
            'channel_ids' => is_array($channelIds) ? array_values(array_map('intval', $channelIds)) : [],
            'template' => (string) SiteSetting::get($prefix . 'template', self::DEFAULTS[$kind]['template']),
            'unattended' => filter_var(SiteSetting::get($prefix . 'unattended', '0'), FILTER_VALIDATE_BOOLEAN),
            // Chef's pick only: which weekdays (0 = Sunday … 6 = Saturday).
            'days' => is_array($days) ? array_values(array_unique(array_filter(array_map('intval', $days), fn (int $d) => $d >= 0 && $d <= 6))) : [0, 1, 2, 3, 4, 5, 6],
            // New on the menu only: how long an item counts as new.
            'max_age_days' => max(1, min(90, (int) SiteSetting::get($prefix . 'max_age_days', '14'))),
        ];
    }

    /** @return array<string, array<string, mixed>> */
    public function allKinds(): array
    {
        $out = [];
        foreach (self::KINDS as $kind) {
            $out[$kind] = $this->forKind($kind);
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed> the kind's settings after the write
     */
    public function update(array $input, string $kind = 'special'): array
    {
        $kind = in_array($kind, self::KINDS, true) ? $kind : 'special';
        $prefix = 'social_auto_' . $kind . '_';

        if (array_key_exists('enabled', $input)) {
            SiteSetting::set($prefix . 'enabled', filter_var($input['enabled'], FILTER_VALIDATE_BOOLEAN) ? '1' : '0');
        }
        if (array_key_exists('time', $input)) {
            SiteSetting::set($prefix . 'time', (string) $input['time']);
        }
        if (array_key_exists('channel_ids', $input) && is_array($input['channel_ids'])) {
            SiteSetting::set($prefix . 'channel_ids', json_encode(array_values(array_map('intval', $input['channel_ids']))));
        }
        if (array_key_exists('template', $input)) {
            SiteSetting::set($prefix . 'template', (string) $input['template']);
        }
        if (array_key_exists('unattended', $input)) {
            SiteSetting::set($prefix . 'unattended', filter_var($input['unattended'], FILTER_VALIDATE_BOOLEAN) ? '1' : '0');
        }
        if (array_key_exists('days', $input) && is_array($input['days'])) {
            SiteSetting::set($prefix . 'days', json_encode(array_values(array_unique(array_map('intval', $input['days'])))));
        }
        if (array_key_exists('max_age_days', $input)) {
            SiteSetting::set($prefix . 'max_age_days', (string) max(1, min(90, (int) $input['max_age_days'])));
        }
        SiteSetting::bust();

        return $this->forKind($kind);
    }
}
