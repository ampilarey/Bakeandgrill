<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SiteSetting;
use App\Services\AuditLogService;
use App\Services\FeatureGateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Owner controls for online ordering feature gates: kill switch, per-day
 * schedule, and force-open override — one uniform surface for
 * order-for-tomorrow, dine-in pre-order, reservations, and gift cards.
 *
 * GET /api/admin/ordering/feature-gates
 * PUT /api/admin/ordering/feature-gates/{key}
 */
class FeatureGateController extends Controller
{
    public function __construct(
        private readonly FeatureGateService $gates,
        private readonly AuditLogService $audit,
    ) {}

    public function index(): JsonResponse
    {
        return response()->json(['gates' => $this->gates->allStatuses()]);
    }

    public function update(Request $request, string $key): JsonResponse
    {
        if (!$this->gates->isKnown($key)) {
            abort(404, 'Unknown feature gate.');
        }

        $validated = $request->validate([
            'enabled' => 'sometimes|boolean',
            'schedule' => 'sometimes|nullable|array',
            'override_until' => 'sometimes|nullable|date',
        ]);

        if (array_key_exists('enabled', $validated)) {
            $this->write($request, "{$key}_enabled", $validated['enabled'] ? '1' : '0');
        }

        if (array_key_exists('schedule', $validated)) {
            $this->write(
                $request,
                "{$key}_schedule",
                $validated['schedule'] ? json_encode($validated['schedule']) : null,
            );
        }

        if (array_key_exists('override_until', $validated)) {
            $this->write($request, "{$key}_override_until", $validated['override_until'] ?: null);
        }

        return response()->json(['gate' => $this->gates->status($key)]);
    }

    private function write(Request $request, string $settingKey, ?string $newValue): void
    {
        $old = SiteSetting::get($settingKey);
        if ((string) $old === (string) $newValue) {
            return;
        }

        SiteSetting::set($settingKey, $newValue);

        $this->audit->log(
            action: 'ordering_gate.' . $settingKey . '.updated',
            modelType: SiteSetting::class,
            modelId: null,
            oldValues: ['value' => $old],
            newValues: ['value' => $newValue],
            meta: ['setting_key' => $settingKey],
            request: $request,
        );
    }
}
