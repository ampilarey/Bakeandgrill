<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Public-facing shape of a single service in GET /api/service-status.
 *
 * Consumed by the order-app banner, Blade partial, and any client checking
 * whether a specific customer flow is currently accepted.
 */
class ServiceStatusResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'service_key' => $this->resource['service_key'],
            'group' => $this->resource['group'],
            'available' => (bool) $this->resource['available'],
            'status' => $this->resource['status'],
            'reason_type' => $this->resource['reason_type'] ?? null,
            'public_message' => $this->resource['public_message'] ?? null,
            'alternatives' => $this->resource['alternatives'] ?? [],
            'retry_at' => $this->resource['ends_at'] ?? null,
            'starts_at' => $this->resource['starts_at'] ?? null,
            'notify_enabled' => (bool) ($this->resource['notify_enabled'] ?? false),
            'incident_id' => $this->resource['current_incident_id'] ?? null,
        ];
    }
}
