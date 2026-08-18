<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Http\Controllers\Controller;
use App\Services\PosMenuBuilder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Single-shot POS menu feed — categories + channel-filtered items in
 * one round trip, without the N+1 availability queries the public
 * /items endpoint runs per row.
 */
class PosMenuController extends Controller
{
    public function index(
        Request $request,
        PosMenuBuilder $menuBuilder,
    ): JsonResponse {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $channel = $request->query('channel');
        if (!is_string($channel) || !in_array($channel, KitchenMenuResolver::CHANNELS, true)) {
            $channel = 'dine_in';
        }

        $menu = $menuBuilder->build($channel);

        return response()->json([
            'categories' => $menu['categories'],
            'items' => $menu['items'],
            // anchor item id => suggested item ids, ranked by lift. Travels
            // with the menu so the chips survive an offline till.
            'pairings' => $menu['pairings'],
        ]);
    }
}
