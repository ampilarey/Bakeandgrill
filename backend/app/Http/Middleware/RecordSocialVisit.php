<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\SocialLinkVisit;
use App\Models\SocialPostDelivery;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Cookie;
use Symfony\Component\HttpFoundation\Response;

/**
 * Link tracking (owner's shortlist, 2026-09-24). A post's link carries
 * ?s=<delivery id>; a page hit with it is counted once per visitor per
 * hour and leaves a week-long cookie, so an order placed later can be
 * traced back to the post. Never slows or breaks the page: any failure
 * is swallowed.
 */
class RecordSocialVisit
{
    public const COOKIE = 'bg_social';

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $raw = $request->query('s');
        if (!is_string($raw) || !ctype_digit($raw) || $request->method() !== 'GET') {
            return $response;
        }

        try {
            $deliveryId = (int) $raw;
            if ($deliveryId <= 0 || !SocialPostDelivery::query()->whereKey($deliveryId)->exists()) {
                return $response;
            }
            $hash = hash('sha256', ($request->ip() ?? '') . '|' . (string) $request->userAgent());
            if (Cache::add('social-visit:' . $deliveryId . ':' . $hash, 1, 3600)) {
                SocialLinkVisit::create([
                    'social_post_delivery_id' => $deliveryId,
                    'path' => mb_substr($request->path(), 0, 255),
                    'visitor_hash' => $hash,
                    'created_at' => now(),
                ]);
            }
            $response->headers->setCookie(Cookie::make(self::COOKIE, (string) $deliveryId, 60 * 24 * 7, '/', null, null, true, false, 'Lax'));
        } catch (\Throwable) {
            // a broken counter must never break the menu
        }

        return $response;
    }
}
