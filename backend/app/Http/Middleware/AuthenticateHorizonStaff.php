<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resolve a staff User for Horizon dashboard routes (session or Sanctum token).
 */
class AuthenticateHorizonStaff
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user() instanceof User) {
            return $next($request);
        }

        $user = Auth::guard('sanctum')->user();

        if ($user instanceof User) {
            Auth::login($user);
        }

        return $next($request);
    }
}
