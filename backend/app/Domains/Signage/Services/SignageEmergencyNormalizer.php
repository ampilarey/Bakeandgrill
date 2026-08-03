<?php

declare(strict_types=1);

namespace App\Domains\Signage\Services;

use App\Models\SiteSetting;

/**
 * Normalizes manual emergency override + scheduled emergency entries.
 *
 * @phpstan-type EmergencyEntry array{
 *   id: string,
 *   mode: string,
 *   priority: int,
 *   is_active: bool,
 *   layout: string,
 *   title: string,
 *   body: string,
 *   title_dv: string,
 *   body_dv: string,
 *   reopen_at: string|null,
 *   schedule: array<string, mixed>|null
 * }
 * @phpstan-type EmergencySettings array{
 *   manual: string,
 *   entries: list<EmergencyEntry>
 * }
 */
final class SignageEmergencyNormalizer
{
  /** @var list<string> */
    public const MODES = [
        'none',
        'closed',
        'prayer_break',
        'maintenance',
        'fire_alarm',
        'power_failure',
        'kitchen_closed',
        'staff_only',
        'private_event',
        'holiday',
        'special_notice',
        'reopening_soon',
    ];

    /** @var list<string> */
    public const LAYOUTS = ['notice', 'alert', 'split', 'countdown'];

    /**
     * @return EmergencySettings
     */
    public static function normalizeFromSettings(): array
    {
        $manual = (string) SiteSetting::get('signage_emergency', 'none');
        $raw = SiteSetting::get('signage_emergency_entries', '{}');
        $cfg = is_string($raw) ? (json_decode($raw, true) ?: []) : (is_array($raw) ? $raw : []);

        return self::normalize($manual, $cfg);
    }

    /**
     * @param  mixed  $entriesRaw
     * @return EmergencySettings
     */
    public static function normalize(string $manual, mixed $entriesRaw = null): array
    {
        $mode = in_array($manual, self::MODES, true) ? $manual : 'none';
        $entries = [];
        $list = is_array($entriesRaw) ? ($entriesRaw['entries'] ?? $entriesRaw) : [];
        if (is_array($list)) {
            foreach (array_values($list) as $i => $item) {
                if (! is_array($item)) {
                    continue;
                }
                $entries[] = self::normalizeEntry($item, $i);
            }
        }

        return ['manual' => $mode, 'entries' => $entries];
    }

    /**
     * @param  array<string, mixed>  $raw
     * @return EmergencyEntry
     */
    public static function normalizeEntry(array $raw, int $fallbackIndex = 0): array
    {
        $mode = (string) ($raw['mode'] ?? 'special_notice');
        if (! in_array($mode, self::MODES, true) || $mode === 'none') {
            $mode = 'special_notice';
        }

        $layout = (string) ($raw['layout'] ?? self::defaultLayoutForMode($mode));
        if (! in_array($layout, self::LAYOUTS, true)) {
            $layout = self::defaultLayoutForMode($mode);
        }

        $defaults = self::defaultCopyForMode($mode);
        $title = (string) ($raw['title'] ?? $defaults['title']);
        $body = (string) ($raw['body'] ?? $defaults['body']);

        $priority = (int) ($raw['priority'] ?? 0);
        if ($priority < 0) {
            $priority = 0;
        }
        if ($priority > 9999) {
            $priority = 9999;
        }

        $reopenAt = isset($raw['reopen_at']) && is_string($raw['reopen_at']) && $raw['reopen_at'] !== ''
            ? $raw['reopen_at']
            : null;

        return [
            'id' => (string) ($raw['id'] ?? ('emg-'.$fallbackIndex)),
            'mode' => $mode,
            'priority' => $priority,
            'is_active' => ($raw['is_active'] ?? true) !== false,
            'layout' => $layout,
            'title' => $title,
            'body' => $body,
            'title_dv' => (string) ($raw['title_dv'] ?? ''),
            'body_dv' => (string) ($raw['body_dv'] ?? ''),
            'reopen_at' => $reopenAt,
            'schedule' => SignageBannerNormalizer::normalizeSchedule($raw['schedule'] ?? null),
        ];
    }

    public static function defaultLayoutForMode(string $mode): string
    {
        return match ($mode) {
            'fire_alarm' => 'alert',
            'reopening_soon' => 'countdown',
            default => 'notice',
        };
    }

    /**
     * @return array{title: string, body: string}
     */
    public static function defaultCopyForMode(string $mode): array
    {
        return match ($mode) {
            'closed' => ['title' => 'We are closed', 'body' => 'Thank you for visiting. See you soon.'],
            'prayer_break' => ['title' => 'Prayer break', 'body' => 'Service will resume shortly. {{next_prayer}}'],
            'maintenance' => ['title' => 'Under maintenance', 'body' => 'We will be right back.'],
            'fire_alarm' => ['title' => 'Please evacuate', 'body' => 'Follow staff instructions. Leave calmly.'],
            'power_failure' => ['title' => 'Temporary power issue', 'body' => 'Service may be delayed. Thank you for your patience.'],
            'kitchen_closed' => ['title' => 'Kitchen temporarily closed', 'body' => 'Please ask staff for details.'],
            'staff_only' => ['title' => 'Staff only', 'body' => 'This area is restricted to staff at this time.'],
            'private_event' => ['title' => 'Private event', 'body' => 'We are hosting a private event. Please check with staff.'],
            'holiday' => ['title' => 'Holiday hours', 'body' => 'We may be operating on reduced hours today.'],
            'special_notice' => ['title' => 'Special notice', 'body' => 'Please see staff for details.'],
            'reopening_soon' => ['title' => 'Reopening soon', 'body' => 'We will be back shortly.'],
            default => ['title' => 'Please stand by', 'body' => ''],
        };
    }
}
