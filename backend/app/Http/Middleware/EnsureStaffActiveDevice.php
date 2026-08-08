<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Apply EnsureActiveDevice only when the actor is staff.
 *
 * Shared customer/staff routes (e.g. POST /orders/delivery) must keep
 * customer online ordering free of POS device headers, while staff POS
 * phone/delivery sales still honor disabled-device and optional header rules.
 */
class EnsureStaffActiveDevice
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!($user instanceof User)) {
            return $next($request);
        }

        return app(EnsureActiveDevice::class)->handle($request, $next);
    }
}
