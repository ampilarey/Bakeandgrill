<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\System\Services\ServiceAvailabilityService;
use App\Http\Controllers\Controller;
use App\Http\Resources\ServiceStatusResource;
use App\Models\SiteSetting;
use App\Services\AuditLogService;
use App\Services\CateringOrderingGateService;
use App\Services\DeliveryGateService;
use App\Services\OnlineOrderingGateService;
use App\Services\OrderFulfilDateService;
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
        private readonly DeliveryGateService $deliveryGate,
        private readonly CateringOrderingGateService $cateringGate,
        private readonly ServiceAvailabilityService $availability,
        private readonly AuditLogService $audit,
    ) {}

    /**
     * Audit any legacy gate write (SiteSetting-backed) so admin actions leave
     * a paper trail. Fixes the "no AuditLogService call anywhere" defect
     * noted in the plan §0.
     */
    private function auditGateWrite(
        string $key,
        mixed $old,
        mixed $new,
        Request $request,
        array $meta = [],
    ): void {
        $this->audit->log(
            action: 'ordering_gate.' . $key . '.updated',
            modelType: SiteSetting::class,
            modelId: null,
            oldValues: ['value' => $old],
            newValues: ['value' => $new],
            meta: array_merge(['setting_key' => $key], $meta),
            request: $request,
        );
    }

    /** Public status — returns current open/closed state for the order app. */
    public function status(): JsonResponse
    {
        $status = $this->gate->status();

        // Delivery is only meaningful when online ordering is open.
        // If the ordering gate is closed, delivery is also unavailable regardless of its own flag.
        $deliveryStatus = $this->deliveryGate->status();
        $status['delivery_available'] = $status['open'] && $deliveryStatus['delivery_open'];
        $status['next_delivery_window'] = $deliveryStatus['next_delivery_window'] ?? null;
        $status['preorder'] = $this->cateringGate->status();
        $status['order_for_tomorrow'] = app(OrderFulfilDateService::class)->statusFragment();

        $featureGates = app(\App\Services\FeatureGateService::class);
        $status['dine_in_preorder'] = [
            // 'enabled' = master switch (legacy readers); 'open' = effective
            // right now after schedule + override — new readers use this.
            'enabled' => $featureGates->enabled('dine_in_preorder'),
            'open' => $featureGates->open('dine_in_preorder'),
        ];
        $status['reservations'] = ['open' => $featureGates->open('reservations')];
        $status['gift_cards'] = ['open' => $featureGates->open('gift_card_purchase')];

        // Per-mode gates (additive; older clients ignore).
        $status['modes'] = [
            'pickup' => [
                'enabled' => $featureGates->enabled('pickup_ordering'),
                'open' => $status['open'] && $featureGates->open('pickup_ordering'),
            ],
            'delivery' => [
                'enabled' => (bool) ($deliveryStatus['accepting_flag'] ?? true),
                'open' => (bool) $status['delivery_available'],
            ],
            'dine_in' => [
                'enabled' => $featureGates->enabled('dine_in_preorder'),
                'open' => $status['open'] && $featureGates->open('dine_in_preorder'),
            ],
        ];

        // Additive services map — older clients ignore it. Same shape as
        // GET /api/service-status so a single reader can consume either.
        $snapshot = $this->availability->resolve();
        $services = [];
        foreach ($snapshot as $key => $data) {
            $services[$key] = (new ServiceStatusResource($data))->toArray(request());
        }
        $status['services'] = $services;

        return response()->json($status);
    }

    /** Public pre-order / events gate status. */
    public function cateringStatus(): JsonResponse
    {
        return response()->json($this->cateringGate->status());
    }

    /**
     * Toggle pre-order / event requests master switch.
     * Body: { "enabled": true|false }  or  no body (flips current state).
     */
    public function toggleCatering(Request $request): JsonResponse
    {
        $current = filter_var(
            SiteSetting::get('catering_ordering_enabled', '1'),
            FILTER_VALIDATE_BOOLEAN,
            FILTER_NULL_ON_FAILURE,
        ) ?? true;

        $next = $request->has('enabled')
            ? (bool) $request->input('enabled')
            : !$current;

        $newValue = $next ? '1' : '0';
        SiteSetting::set('catering_ordering_enabled', $newValue);
        $this->auditGateWrite('catering_ordering_enabled', $current ? '1' : '0', $newValue, $request);

        return response()->json([
            'catering_ordering_enabled' => $next,
            'status' => $this->cateringGate->status(),
        ]);
    }

    /**
     * Update pre-order schedule.
     * Body: { "schedule": { "mon": {"open":"07:00","close":"22:00","enabled":true}, ... } }
     * Send { "schedule": null } to clear (always open when master switch is on).
     */
    public function updateCateringSchedule(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'schedule' => 'nullable|array',
        ]);

        $schedule = $validated['schedule'] ?? null;
        $oldSchedule = SiteSetting::get('catering_ordering_schedule');
        $newSchedule = $schedule ? json_encode($schedule) : null;
        SiteSetting::set('catering_ordering_schedule', $newSchedule);
        $this->auditGateWrite('catering_ordering_schedule', $oldSchedule, $newSchedule, $request);

        return response()->json([
            'catering_ordering_schedule' => $schedule,
            'status' => $this->cateringGate->status(),
        ]);
    }

    /**
     * Set or clear the pre-order force-open override.
     * Body: { "override_until": "2026-04-18T23:59:00" }  — set
     *       { "override_until": null }                    — clear
     */
    public function cateringOverride(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'override_until' => 'nullable|date',
        ]);

        $oldValue = SiteSetting::get('catering_ordering_override_until');
        $newValue = $validated['override_until'] ?? null;
        SiteSetting::set('catering_ordering_override_until', $newValue);
        $this->auditGateWrite('catering_ordering_override_until', $oldValue, $newValue, $request);

        return response()->json([
            'override_until' => $validated['override_until'],
            'status' => $this->cateringGate->status(),
        ]);
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
            : !$current;

        $newValue = $next ? '1' : '0';
        SiteSetting::set('online_ordering_enabled', $newValue);
        $this->auditGateWrite('online_ordering_enabled', $current ? '1' : '0', $newValue, $request);

        return response()->json([
            'online_ordering_enabled' => $next,
            'status' => $this->gate->status(),
        ]);
    }

    /**
     * Update the online ordering schedule.
     * Body: { "schedule": { "mon": {"open":"07:00","close":"22:00","enabled":true}, ... } }
     * Send { "schedule": null } to clear (always open when master switch is on).
     */
    public function updateSchedule(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'schedule' => 'nullable|array',
        ]);

        $schedule = $validated['schedule'] ?? null;
        $oldSchedule = SiteSetting::get('online_ordering_schedule');
        $newSchedule = $schedule ? json_encode($schedule) : null;
        SiteSetting::set('online_ordering_schedule', $newSchedule);
        $this->auditGateWrite('online_ordering_schedule', $oldSchedule, $newSchedule, $request);

        $status = $this->gate->status();
        $deliveryStatus = $this->deliveryGate->status();
        $status['delivery_available'] = $status['open'] && $deliveryStatus['delivery_open'];
        $status['next_delivery_window'] = $deliveryStatus['next_delivery_window'] ?? null;

        return response()->json([
            'online_ordering_schedule' => $schedule,
            'status' => $status,
        ]);
    }

    /**
     * Toggle the delivery accepting flag.
     * Body: { "enabled": true|false }  or  no body (flips current state).
     */
    public function toggleDelivery(Request $request): JsonResponse
    {
        $current = filter_var(
            SiteSetting::get('delivery_accepting_orders', '1'),
            FILTER_VALIDATE_BOOLEAN,
            FILTER_NULL_ON_FAILURE,
        ) ?? true;

        $next = $request->has('enabled')
            ? (bool) $request->input('enabled')
            : !$current;

        $newValue = $next ? '1' : '0';
        SiteSetting::set('delivery_accepting_orders', $newValue);
        $this->auditGateWrite('delivery_accepting_orders', $current ? '1' : '0', $newValue, $request);

        $deliveryStatus = $this->deliveryGate->status();

        return response()->json([
            'delivery_accepting_orders' => $next,
            'delivery_status' => $deliveryStatus,
        ]);
    }

    /**
     * Update the delivery schedule.
     * Body: { "schedule": { "mon": {"open":"11:00","close":"22:00","enabled":true}, ... } }
     * Send { "schedule": null } to clear the schedule (delivery available all day when flag is on).
     */
    public function updateDeliverySchedule(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'schedule' => 'nullable|array',
        ]);

        $schedule = $validated['schedule'] ?? null;
        $oldSchedule = SiteSetting::get('delivery_schedule');
        $newSchedule = $schedule ? json_encode($schedule) : null;
        SiteSetting::set('delivery_schedule', $newSchedule);
        $this->auditGateWrite('delivery_schedule', $oldSchedule, $newSchedule, $request);

        return response()->json([
            'delivery_schedule' => $schedule,
            'delivery_status' => $this->deliveryGate->status(),
        ]);
    }

    /**
     * Set or clear the delivery force-open override.
     * Body: { "override_until": "2026-05-09T23:59:00" }  — set
     *       { "override_until": null }                    — clear
     */
    public function deliveryOverride(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'override_until' => 'nullable|date',
        ]);

        $oldValue = SiteSetting::get('delivery_override_until');
        $newValue = $validated['override_until'] ?? null;
        SiteSetting::set('delivery_override_until', $newValue);
        $this->auditGateWrite('delivery_override_until', $oldValue, $newValue, $request);

        return response()->json([
            'override_until' => $validated['override_until'],
            'delivery_status' => $this->deliveryGate->status(),
        ]);
    }

    /**
     * Cap concurrent open delivery orders (0 = unlimited).
     * Body: { "max_active_orders": 12 }
     */
    public function updateDeliveryCapacity(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'max_active_orders' => ['required', 'integer', 'min:0', 'max:500'],
        ]);

        $oldValue = SiteSetting::get('delivery_max_active_orders');
        $newValue = (string) $validated['max_active_orders'];
        SiteSetting::set('delivery_max_active_orders', $newValue);
        $this->auditGateWrite('delivery_max_active_orders', $oldValue, $newValue, $request);

        return response()->json([
            'max_active_orders' => $validated['max_active_orders'],
            'delivery_status' => $this->deliveryGate->status(),
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

        $oldValue = SiteSetting::get('online_ordering_override_until');
        $newValue = $validated['override_until'] ?? null;
        SiteSetting::set('online_ordering_override_until', $newValue);
        $this->auditGateWrite('online_ordering_override_until', $oldValue, $newValue, $request);

        return response()->json([
            'override_until' => $validated['override_until'],
            'status' => $this->gate->status(),
        ]);
    }

    /**
     * Owner sets the "order for tomorrow" cutoff time (HH:mm).
     * Body: { "cutoff": "20:00" }
     */
    public function updateTomorrowCutoff(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'cutoff' => ['required', 'string', 'regex:/^\d{1,2}:\d{2}$/'],
        ]);

        try {
            $normalized = \Carbon\Carbon::createFromFormat('H:i', $validated['cutoff'])
                ->format('H:i');
        } catch (\Throwable) {
            return response()->json(['message' => 'Cutoff must be HH:mm (24-hour).'], 422);
        }

        $oldValue = SiteSetting::get(OrderFulfilDateService::SETTING_KEY);
        SiteSetting::set(OrderFulfilDateService::SETTING_KEY, $normalized);
        $this->auditGateWrite(OrderFulfilDateService::SETTING_KEY, $oldValue, $normalized, $request);

        $status = $this->gate->status();
        $status['order_for_tomorrow'] = app(OrderFulfilDateService::class)->statusFragment();

        return response()->json([
            'order_for_tomorrow_cutoff' => $normalized,
            'status' => $status,
        ]);
    }
}
