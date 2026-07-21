<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\ServiceState;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Admin-facing shape of a single service_state row + resolved data.
 *
 * Distinct from the public ServiceStatusResource: this exposes internal
 * fields (allow_admin_bypass, changed_by, etc.) that the operator needs.
 */
class ServiceStateResource extends JsonResource
{
    public static $wrap = null;

    /**
     * The wrapped resource may be a ServiceState model + a resolved snapshot
     * entry. When both are provided the resolved fields are merged in.
     */
    public function toArray(Request $request): array
    {
        /** @var ServiceState $model */
        $model = $this->resource['model'] ?? $this->resource;
        $snapshot = $this->resource['snapshot'] ?? [];

        return [
            'service_key' => $model->service_key,
            'group' => $model->group,
            'status' => $model->status,
            'reason_type' => $model->reason_type,
            'public_message' => $model->public_message,
            'internal_note' => $model->internal_note,
            'alternatives' => $model->alternatives ?? [],
            'allow_existing_operations' => (bool) $model->allow_existing_operations,
            'allow_admin_bypass' => (bool) $model->allow_admin_bypass,
            'starts_at' => optional($model->starts_at)->toIso8601String(),
            'ends_at' => optional($model->ends_at)->toIso8601String(),
            'notify_enabled' => (bool) $model->notify_enabled,
            'current_incident_id' => $model->current_incident_id,
            'changed_by' => $model->changed_by,
            'updated_at' => optional($model->updated_at)->toIso8601String(),
            // Resolved view — reflects overlay + adapter + env fallbacks
            'resolved_available' => (bool) ($snapshot['available'] ?? ($model->status === 'available')),
            'resolved_source' => $snapshot['source'] ?? 'db',
        ];
    }
}
