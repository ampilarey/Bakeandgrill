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
        $etag = '"' . sha1($css) . '"';
        if ($request->header('If-None-Match') === $etag) {
            return response('', 304, [
                'ETag' => $etag,
                'Cache-Control' => 'public, max-age=60, must-revalidate',
                'Content-Type' => 'text/css; charset=UTF-8',
            ]);
        }

        return response($css, 200, [
            'Content-Type' => 'text/css; charset=UTF-8',
            'Cache-Control' => 'public, max-age=60, must-revalidate',
            'ETag' => $etag,
        ]);
    }
}
