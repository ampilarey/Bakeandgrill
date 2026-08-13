<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Content\ContentResolver;
use App\Domains\Promotions\Services\OffersService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OffersController extends Controller
{
    public function __construct(private OffersService $offers) {}

    public function index(Request $request): JsonResponse
    {
        $list = $this->offers->activeOffers();

        // Customer-facing copy is per app. Default to order_app (this endpoint
        // powers the Order App); ?app=website is accepted for the marketing site.
        $app = (string) $request->query('app', 'order_app');
        if (! in_array($app, ['website', 'order_app'], true)) {
            $app = 'order_app';
        }
        $content = ContentResolver::for($app);

        $headline = $content->get('offers_headline', '');
        $subtext = $content->get('offers_subtext', '');

        return response()->json([
            'offers' => $list,
            'headline' => (is_string($headline) && $headline !== '') ? $headline : null,
            'subtext' => (is_string($subtext) && $subtext !== '') ? $subtext : null,
        ]);
    }
}
