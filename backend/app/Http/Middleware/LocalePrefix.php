<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Support\LocaleUrl;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Serves /dv/... for public website pages (iruali import plan, feature 3b).
 * Runs before routing: the prefix is stripped and the request goes on marked
 * Dhivehi (SetContentLocale reads the mark). Not a public page: 404. Dhivehi
 * switched off: 302 to the English page. An old ?lang=dv link on a public page:
 * 301 to its /dv address.
 */
class LocalePrefix
{
    public function handle(Request $request, Closure $next): Response
    {
        $path = '/' . ltrim($request->getPathInfo(), '/');
        if (preg_match('#^/dv(/.*)?$#', $path, $m) === 1) {
            $rest = ($m[1] ?? '') === '' ? '/' : $m[1];
            $query = $request->getQueryString();
            if (!LocaleUrl::dhivehiOn()) {
                return redirect($rest . ($query ? '?' . $query : ''), 302);
            }
            if (!LocaleUrl::isPublic($rest)) {
                abort(404);
            }
            $server = $request->server->all();
            $server['REQUEST_URI'] = $rest . ($query ? '?' . $query : '');
            $server['PATH_INFO'] = $rest;
            $stripped = $request->duplicate(null, null, null, null, null, $server);
            $stripped->attributes->set('locale_prefix', 'dv');
            if ($request->hasSession()) {
                $stripped->setLaravelSession($request->session());
            }

            return $next($stripped);
        }

        if ($request->isMethod('GET') && $request->query('lang') === 'dv' && LocaleUrl::isPublic($path) && LocaleUrl::dhivehiOn()) {
            $others = $request->query();
            unset($others['lang']);

            return redirect(LocaleUrl::to($path, 'dv') . ($others ? '?' . http_build_query($others) : ''), 301);
        }

        return $next($request);
    }
}
