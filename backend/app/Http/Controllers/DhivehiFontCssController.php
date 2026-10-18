<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Content\ContentRegistry;
use App\Domains\Content\DhivehiFont;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class DhivehiFontCssController extends Controller
{
    public function show(Request $request): Response
    {
        $app = (string) $request->query('app', 'website');
        if (!in_array($app, ContentRegistry::APPS, true)) {
            $app = 'website';
        }

        $css = DhivehiFont::stylesheet($app);
        $sha = sha1($css);
        $etag = '"' . $sha . '"';
        // A link carrying this very sheet's version (DhivehiFont::href) never changes, so
        // it may be kept; the bare address, or an old version, must be asked again.
        $cache = $request->query('v') === substr($sha, 0, 12)
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=60, must-revalidate';
        if ($request->header('If-None-Match') === $etag) {
            return response('', 304, [
                'ETag' => $etag,
                'Cache-Control' => $cache,
                'Content-Type' => 'text/css; charset=UTF-8',
            ]);
        }

        return response($css, 200, [
            'Content-Type' => 'text/css; charset=UTF-8',
            'Cache-Control' => $cache,
            'ETag' => $etag,
        ]);
    }
}
