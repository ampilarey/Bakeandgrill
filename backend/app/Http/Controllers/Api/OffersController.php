<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Promotions\Services\OffersService;
use App\Http\Controllers\Controller;
use App\Models\SiteSetting;
use Illuminate\Http\JsonResponse;

class OffersController extends Controller
{
    public function __construct(private OffersService $offers) {}

    public function index(): JsonResponse
    {
        $list = $this->offers->activeOffers();

        return response()->json([
            'offers' => $list,
            'headline' => SiteSetting::get('offers_headline', '') ?: null,
            'subtext' => SiteSetting::get('offers_subtext', '') ?: null,
        ]);
    }
}
