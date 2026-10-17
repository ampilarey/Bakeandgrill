<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Posters\PosterBanner;
use App\Domains\Posters\PosterSocial;
use App\Domains\Posters\PosterTv;
use App\Http\Controllers\Controller;
use App\Models\Poster;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/** TV, a social draft, and the optional home banner for one poster. */
class PosterEverywhereController extends Controller
{
    public function tv(Poster $poster): JsonResponse
    {
        try {
            return response()->json(PosterTv::send($poster));
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function social(Poster $poster): JsonResponse
    {
        try {
            return response()->json(PosterSocial::draft($poster));
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function banner(Request $request, Poster $poster): JsonResponse
    {
        $data = $request->validate(['on' => ['required', 'boolean']]);
        try {
            $on = PosterBanner::publish($poster, (bool) $data['on']);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['on' => $on, 'code' => $poster->code()]);
    }
}
