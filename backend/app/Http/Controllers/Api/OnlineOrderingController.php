<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SiteSetting;
use App\Services\OnlineOrderingGateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public and admin endpoints for the online ordering gate.
 *
 * GET  /api/ordering/status          — public, no auth (used by the order app banner)
 * POST /api/admin/ordering/toggle    — owner only, flips the master switch
 * POST /api/admin/ordering/override  — owner only, sets/clears the force-open override
 */
class OnlineOrderingController extends Controller
{
    public function __construct(
        private readonly OnlineOrderingGateService $gate,
    ) {}

    /** Public status — returns current open/closed state for the order app. */
    public function status(): JsonResponse
    {
        return response()->json($this->gate->status());
    }

    /**
     * Toggle the master switch.
     * Body: { "enabled": true|false }  or  no body (flips current state).
     */
    public function toggle(Request $request): JsonResponse
    {
        $current = filter_var(
            SiteSetting::get('online_ordering_enabled', '1'),
            FILTER_VALIDATE_BOOLEAN,
            FILTER_NULL_ON_FAILURE,
        ) ?? true;

        $next = $request->has('enabled')
            ? (bool) $request->input('enabled')
            : ! $current;

        SiteSetting::set('online_ordering_enabled', $next ? '1' : '0');

        return response()->json([
            'online_ordering_enabled' => $next,
            'status' => $this->gate->status(),
        ]);
    }

    /**
     * Set or clear the force-open override.
     * Body: { "override_until": "2026-04-18T23:59:00" }  — set
     *       { "override_until": null }                    — clear
     */
    public function override(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'override_until' => 'nullable|date',
        ]);

        SiteSetting::set('online_ordering_override_until', $validated['override_until'] ?? null);

        return response()->json([
            'override_until' => $validated['override_until'],
            'status' => $this->gate->status(),
        ]);
    }
}
