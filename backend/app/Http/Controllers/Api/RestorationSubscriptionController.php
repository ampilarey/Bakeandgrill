<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreRestorationSubscriptionRequest;
use App\Models\RestorationSubscription;
use App\Models\ServiceIncident;
use App\Models\ServiceState;
use App\Rules\MaldivesPhone;
use Illuminate\Http\JsonResponse;

/**
 * Public restoration signup endpoint (plan §14 / Stage 6).
 *
 * Design:
 *  - Identical generic success response for new, duplicate, and never-heard-of
 *    numbers so we never leak whether a phone is on file (no enumeration).
 *  - `service_incident_id` snapshotted from the currently-open incident on
 *    the service_state row so restorations can never bleed across outages.
 *  - IP is hashed (not stored raw) to preserve per-IP throttling insight
 *    without persisting PII beyond the incident window.
 *  - Route is throttled to 5 requests/min per IP in api.php.
 */
class RestorationSubscriptionController extends Controller
{
    public function store(StoreRestorationSubscriptionRequest $request): JsonResponse
    {
        $serviceKey = (string) $request->input('service_key');
        $mobile = MaldivesPhone::normalize((string) $request->input('mobile'));

        $incidentId = $this->resolveIncidentId(
            serviceKey: $serviceKey,
            requestedIncidentId: $request->integer('incident_id') ?: null,
        );

        RestorationSubscription::query()->firstOrCreate(
            [
                'service_incident_id' => $incidentId,
                'normalized_mobile' => $mobile,
            ],
            [
                'service_key' => $serviceKey,
                'status' => 'pending',
                'consent_text_version' => (string) config('service_availability.consent_text_version', 'v1'),
                'requested_at' => now(),
                'request_ip_hash' => $request->ip() ? hash('sha256', (string) $request->ip()) : null,
            ],
        );

        return response()->json([
            'ok' => true,
            'message' => "We'll text you once this service is back.",
        ]);
    }

    /**
     * Snap to the open incident on the referenced service. Fall back to the
     * most recent open incident if the client did not send one.
     */
    private function resolveIncidentId(string $serviceKey, ?int $requestedIncidentId): ?int
    {
        if ($requestedIncidentId !== null) {
            $incident = ServiceIncident::query()
                ->where('id', $requestedIncidentId)
                ->where('service_key', $serviceKey)
                ->first();
            if ($incident) {
                return $incident->id;
            }
        }

        $state = ServiceState::query()->where('service_key', $serviceKey)->first();
        if ($state && $state->current_incident_id) {
            return (int) $state->current_incident_id;
        }

        $open = ServiceIncident::query()
            ->where('service_key', $serviceKey)
            ->where('status', 'open')
            ->orderByDesc('started_at')
            ->first();

        return $open?->id;
    }
}
