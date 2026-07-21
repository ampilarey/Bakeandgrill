<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Domains\System\Services\ServiceAvailabilityService;
use Closure;
use Illuminate\Http\Request;

/**
 * Route-level guard: aborts with ServiceUnavailableException (HTTP 503,
 * JSON shape §12) when the referenced service_key is not currently
 * available.
 *
 * Usage: `->middleware('service.available:catering_inquiry')`.
 * Use for whole-route public forms (registration, catering-requests). For
 * fine-grained action-level control (e.g. checkout inside a broader
 * controller) call ServiceAvailabilityService::assertAvailable directly
 * inside the controller instead.
 */
class EnsureServiceAvailable
{
    public function __construct(private readonly ServiceAvailabilityService $availability) {}

    public function handle(Request $request, Closure $next, string $key)
    {
        $this->availability->assertAvailable($key, [
            'route' => $request->path(),
            'method' => $request->method(),
        ]);

        return $next($request);
    }
}
