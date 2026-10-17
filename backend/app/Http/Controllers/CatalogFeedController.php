<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Menu\Feeds\CatalogFeed;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/** The catalogue feeds and the Admin card that shows and rotates their link (feature 11). */
class CatalogFeedController extends Controller
{
    /** GET /feeds/{token}/google.xml */
    public function google(string $token): Response
    {
        abort_unless(CatalogFeed::matches($token), 404);

        return response(CatalogFeed::xml(), 200, ['Content-Type' => 'application/xml; charset=UTF-8', 'X-Robots-Tag' => 'noindex', 'Cache-Control' => 'public, max-age=1800']);
    }

    /** GET /feeds/{token}/facebook.csv */
    public function facebook(string $token): Response
    {
        abort_unless(CatalogFeed::matches($token), 404);

        return response(CatalogFeed::csv(), 200, ['Content-Type' => 'text/csv; charset=UTF-8', 'X-Robots-Tag' => 'noindex', 'Cache-Control' => 'public, max-age=1800']);
    }

    /** GET /api/admin/feeds */
    public function links(): JsonResponse
    {
        return response()->json(['links' => CatalogFeed::links(), 'count' => count(CatalogFeed::rows())]);
    }

    /** POST /api/admin/feeds/rotate: a new secret; the old links stop working. */
    public function rotate(): JsonResponse
    {
        CatalogFeed::rotate();

        return response()->json(['links' => CatalogFeed::links()]);
    }
}
