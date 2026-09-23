<?php

declare(strict_types=1);

namespace App\Domains\Signage\Services;

use App\Models\SignageDevice;
use Carbon\Carbon;
use Illuminate\Support\Facades\Storage;

/**
 * What the Devices tab and the alert command both need to know about a TV
 * (owner's shortlist, 2026-09-23: "you'll know when a screen is wrong
 * before a customer does").
 *
 * Online: seen in the last two minutes. Offline for alerting: not seen for
 * five. Stuck: awake, not paused, a rotation of more than one slide, and
 * the same slide reported for ten minutes. The heartbeat records when the
 * slide last changed (`meta.slide_since`); the board reports whether it is
 * paused and how many slides it is cycling.
 */
final class SignageDeviceHealth
{
    public const ONLINE_MINUTES = 2;

    public const OFFLINE_ALERT_MINUTES = 5;

    public const STUCK_MINUTES = 10;

    /** Where a TV's latest thumbnail lives on the public disk. */
    public static function screenshotPath(SignageDevice $device): string
    {
        return 'signage/devices/' . $device->id . '.jpg';
    }

    public static function screenshotUrl(SignageDevice $device): ?string
    {
        $meta = $device->meta ?? [];
        $at = $meta['screenshot_at'] ?? null;
        if (!is_string($at) || $at === '') {
            return null;
        }
        $path = self::screenshotPath($device);
        if (!Storage::disk('public')->exists($path)) {
            return null;
        }

        return Storage::disk('public')->url($path) . '?t=' . rawurlencode($at);
    }

    public static function isOnline(SignageDevice $device, ?Carbon $now = null): bool
    {
        $now = $now ?? now();

        return $device->last_seen_at !== null && $device->last_seen_at->gt($now->copy()->subMinutes(self::ONLINE_MINUTES));
    }

    /** Minutes since last seen when that is past the alert threshold, else null. */
    public static function offlineMinutes(SignageDevice $device, ?Carbon $now = null): ?int
    {
        $now = $now ?? now();
        if ($device->last_seen_at === null) {
            return null;
        }
        $minutes = (int) $device->last_seen_at->diffInMinutes($now);

        return $minutes >= self::OFFLINE_ALERT_MINUTES ? $minutes : null;
    }

    /** Minutes on the same slide when that counts as stuck, else null. */
    public static function stuckMinutes(SignageDevice $device, ?Carbon $now = null): ?int
    {
        $now = $now ?? now();
        if (!self::isOnline($device, $now)) {
            return null;
        }
        $meta = $device->meta ?? [];
        if (($meta['mode'] ?? 'awake') === 'asleep' || !empty($meta['paused'])) {
            return null;
        }
        if ((int) ($meta['slide_count'] ?? 0) <= 1) {
            return null;
        }
        $since = $meta['slide_since'] ?? null;
        if (!is_string($since) || $since === '') {
            return null;
        }
        try {
            $minutes = (int) Carbon::parse($since)->diffInMinutes($now);
        } catch (\Throwable) {
            return null;
        }

        return $minutes >= self::STUCK_MINUTES ? $minutes : null;
    }
}
