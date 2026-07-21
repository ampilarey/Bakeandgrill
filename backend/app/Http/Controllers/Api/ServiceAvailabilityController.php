<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\System\Services\ServiceAvailabilityService;
use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateServiceStateRequest;
use App\Http\Resources\ServiceStateResource;
use App\Models\AuditLog;
use App\Models\ServiceIncident;
use App\Models\ServiceState;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Admin-facing endpoints for the maintenance overlay (plan §12).
 *
 * All writes route through ServiceAvailabilityService so every change is
 * audited and cache-invalidated. Route middleware enforces the per-slug
 * permission split (public vs internal vs emergency).
 */
class ServiceAvailabilityController extends Controller
{
    public function __construct(
        private readonly ServiceAvailabilityService $availability,
    ) {}

    /**
     * List every service_states row + resolved snapshot data.
     */
    public function index(): JsonResponse
    {
        $snapshot = $this->availability->resolve();
        $rows = ServiceState::query()->orderBy('group')->orderBy('service_key')->get();

        $data = $rows->map(fn (ServiceState $model) => (new ServiceStateResource([
            'model' => $model,
            'snapshot' => $snapshot[$model->service_key] ?? [],
        ]))->toArray(request()))->all();

        return response()->json([
            'data' => $data,
            'generated_at' => now()->toIso8601String(),
        ]);
    }

    /**
     * Update a single service state. Permission required at route level.
     */
    public function update(UpdateServiceStateRequest $request, string $key): JsonResponse
    {
        $this->assertKnownKey($key);

        $attrs = $request->only([
            'status', 'reason_type', 'public_message', 'internal_note',
            'alternatives', 'starts_at', 'ends_at', 'notify_enabled',
            'allow_existing_operations', 'allow_admin_bypass',
        ]);

        $state = $this->availability->setState(
            key: $key,
            attrs: $attrs,
            actor: $request->user(),
            request: $request,
        );

        return response()->json([
            'data' => (new ServiceStateResource([
                'model' => $state->refresh(),
                'snapshot' => $this->availability->resolve()[$key] ?? [],
            ]))->toArray($request),
        ]);
    }

    /**
     * Apply a preset. Supports ?dry_run=1 to preview affected keys.
     */
    public function preset(Request $request, string $preset): JsonResponse
    {
        $definitions = config("service_availability.presets.$preset");
        if (!is_array($definitions) || $definitions === []) {
            return response()->json(['message' => 'Unknown preset'], 404);
        }

        if ($request->boolean('dry_run')) {
            $preview = [];
            foreach ($definitions as $key => $status) {
                $preview[] = [
                    'service_key' => $key,
                    'target_status' => $status,
                ];
            }

            return response()->json([
                'dry_run' => true,
                'preset' => $preset,
                'changes' => $preview,
            ]);
        }

        $applied = $this->availability->applyPreset(
            preset: $preset,
            actor: $request->user(),
            request: $request,
            reason: $request->string('reason')->toString() ?: null,
        );

        return response()->json([
            'preset' => $preset,
            'applied' => count($applied),
        ]);
    }

    /**
     * Restore a service to available (closes the open incident).
     */
    public function restore(Request $request, string $key): JsonResponse
    {
        $this->assertKnownKey($key);

        $state = $this->availability->setState(
            key: $key,
            attrs: ['status' => 'available', 'reason_type' => null, 'public_message' => null],
            actor: $request->user(),
            request: $request,
        );

        return response()->json([
            'data' => (new ServiceStateResource([
                'model' => $state->refresh(),
                'snapshot' => $this->availability->resolve()[$key] ?? [],
            ]))->toArray($request),
        ]);
    }

    /**
     * Per-service audit + incident history (Stage 4 lightweight — Stage 6
     * adds restoration_subscriptions details).
     */
    public function history(string $key): JsonResponse
    {
        $this->assertKnownKey($key);

        $incidents = ServiceIncident::query()
            ->where('service_key', $key)
            ->orderByDesc('started_at')
            ->limit(50)
            ->get();

        $audits = AuditLog::query()
            ->where('action', 'service_availability.state_changed')
            ->whereJsonContains('meta->service_key', $key)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get(['id', 'action', 'user_id', 'old_values', 'new_values', 'meta', 'created_at']);

        return response()->json([
            'service_key' => $key,
            'incidents' => $incidents,
            'audits' => $audits,
        ]);
    }

    private function assertKnownKey(string $key): void
    {
        if (!array_key_exists($key, config('service_availability.keys', []))) {
            abort(404, "Unknown service_key: {$key}");
        }
    }
}
