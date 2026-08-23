<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\TransientToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Only a board token gets through here.
 *
 * Deliberately strict in both directions:
 *
 *   - A **real access token is required**. Session auth is refused even for a
 *     signed-in owner: a stateful Sanctum request carries a TransientToken,
 *     whose `can()` answers true to everything. Accepting it would mean any
 *     authenticated staff browser reads the board feed, which is not what
 *     "read-only screen credential" should mean.
 *   - The token must carry `board` and nothing else is accepted. A staff or
 *     POS token cannot read this route, and — the direction that matters — a
 *     board token cannot reach any route asking for `staff`, because
 *     EnsureStaffToken checks for that ability. So a token lifted off a wall
 *     screen rings no sales.
 */
class EnsureBoardToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user === null) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $token = $user->currentAccessToken();

        if ($token === null || $token instanceof TransientToken) {
            return response()->json([
                'message' => 'A board token is required — a signed-in session is not one.',
            ], 403);
        }

        if (!$user->tokenCan('board')) {
            return response()->json(['message' => 'This token cannot read the order board.'], 403);
        }

        return $next($request);
    }
}
