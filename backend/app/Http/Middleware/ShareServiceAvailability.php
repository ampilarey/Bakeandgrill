<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Domains\System\Services\ServiceAvailabilityService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\View;

/**
 * Web middleware: shares `$serviceBanner` with the shared Blade layout AND
 * returns the branded `maintenance` view (HTTP 503) for public marketing
 * routes when the `marketing_site` service key is disabled.
 *
 * Plan §7: We do NOT use `php artisan down` — the app must stay reachable so
 * admin, order tracking, receipts, printing and BML webhooks continue to
 * work. This middleware is applied ONLY to the public marketing routes (see
 * `HomeController` route registrations in `routes/web.php`).
 *
 * Top amber banners are intentionally not shown (order-app hero / gate UI
 * already covers ordering status). `marketing_site` still serves the
 * full-screen maintenance view.
 */
class ShareServiceAvailability
{
    public function __construct(private readonly ServiceAvailabilityService $availability) {}

    public function handle(Request $request, Closure $next)
    {
        try {
            $snapshot = $this->availability->resolve();
        } catch (\Throwable $e) {
            // Never break page rendering because the overlay resolver hiccuped.
            View::share('serviceBanner', null);
            View::share('serviceMaintenance', null);

            return $next($request);
        }

        // 1. Full-page maintenance mode — marketing_site itself is disabled.
        $marketing = $snapshot['marketing_site'] ?? null;
        if (is_array($marketing) && !($marketing['available'] ?? true)) {
            return response()->view('maintenance', [
                'serviceMaintenance' => [
                    'message' => $marketing['public_message']
                        ?: 'We\'re making some improvements. We\'ll be back shortly.',
                    'retry_at' => $marketing['ends_at'] ?? null,
                ],
            ], 503, [
                'Retry-After' => '600',
                'Cache-Control' => 'no-store, no-cache, must-revalidate',
            ]);
        }

        // 2. No top-of-page amber banner. Ordering/delivery status already
        // surfaces in the order-app hero (OpeningStatusBadge / ordering
        // status). A second global strip was redundant and confusing.
        // Full-page `marketing_site` maintenance (above) is unchanged.
        View::share('serviceBanner', null);
        View::share('serviceMaintenance', null);

        return $next($request);
    }
}
