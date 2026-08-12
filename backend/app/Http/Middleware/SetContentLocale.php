<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\SiteSetting;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SetContentLocale
{
    private const COOKIE_NAME = 'content_locale';

    private const SUPPORTED_LOCALES = ['en', 'dv'];

    public function handle(Request $request, Closure $next): Response
    {
        $switcherOn = filter_var(
            SiteSetting::get('language_switcher_enabled', 'false'),
            FILTER_VALIDATE_BOOLEAN,
        );

        // When the admin toggle is off, always serve English (ignore cookie / ?lang=).
        if (! $switcherOn) {
            app()->instance('content.locale', 'en');

            /** @var Response $response */
            $response = $next($request);
            $response->headers->setCookie(cookie(
                self::COOKIE_NAME,
                'en',
                60 * 24 * 365,
                '/',
                null,
                $request->isSecure(),
                true,
                false,
                'Lax',
            ));

            return $response;
        }

        $queryLocale = $this->normalizeLocale($request->query('lang'));
        $cookieLocale = $this->normalizeLocale($request->cookie(self::COOKIE_NAME));
        $locale = $queryLocale ?? $cookieLocale ?? 'en';

        app()->instance('content.locale', $locale);

        /** @var Response $response */
        $response = $next($request);

        if ($queryLocale !== null) {
            $response->headers->setCookie(cookie(
                self::COOKIE_NAME,
                $queryLocale,
                60 * 24 * 365,
                '/',
                null,
                $request->isSecure(),
                true,
                false,
                'Lax',
            ));
        }

        return $response;
    }

    private function normalizeLocale(mixed $locale): ?string
    {
        if (!is_string($locale)) {
            return null;
        }

        return in_array($locale, self::SUPPORTED_LOCALES, true) ? $locale : null;
    }
}
