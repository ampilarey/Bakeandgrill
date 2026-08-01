<?php

declare(strict_types=1);

namespace App\Domains\System\Services;

use App\Exceptions\ServiceUnavailableException;
use App\Models\AuditLog;
use App\Models\ServiceIncident;
use App\Models\ServiceState;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\CateringOrderingGateService;
use App\Services\DeliveryGateService;
use App\Services\OnlineOrderingGateService;
use Illuminate\Http\Request;
use App\Support\ResilientCache;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Central resolver + write hub for the maintenance overlay described in
 * docs/SERVICE_AVAILABILITY_MAINTENANCE_PLAN.md §4.
 *
 * Precedence (highest first):
 *   1. env emergency flags (emergency_write_lock, public_transactions_disabled)
 *   2. service_states row status ≠ available
 *   3. legacy gate result (online/delivery/catering GateService) for adapter keys
 *   4. available
 *
 * The three legacy gate services remain SSOT for their own schedule/capacity/
 * override — this class only ORs "closed" over them. It never rebuilds their
 * scheduling logic.
 *
 * Caching: a resolved snapshot is stored in Redis under
 * `service_availability.snapshot` with a very short TTL (see config) and is
 * explicitly busted on every setState/applyPreset write. When the cache
 * backend is unavailable the resolver falls back to a direct DB read.
 */
class ServiceAvailabilityService
{
    private const CACHE_KEY = 'service_availability.snapshot';

    public function __construct(
        private readonly OnlineOrderingGateService $onlineGate,
        private readonly DeliveryGateService $deliveryGate,
        private readonly CateringOrderingGateService $cateringGate,
        private readonly AuditLogService $audit,
    ) {}

    // ------------------------------------------------------------------
    // Read paths
    // ------------------------------------------------------------------

    /**
     * @return array<string, array{
     *   service_key: string,
     *   group: string,
     *   status: string,
     *   available: bool,
     *   reason_type: ?string,
     *   public_message: ?string,
     *   alternatives: array,
     *   allow_existing_operations: bool,
     *   allow_admin_bypass: bool,
     *   starts_at: ?string,
     *   ends_at: ?string,
     *   notify_enabled: bool,
     *   current_incident_id: ?int,
     *   source: string
     * }>
     */
    public function resolve(): array
    {
        $ttl = (int) config('service_availability.cache_ttl_seconds', 30);

        try {
            return ResilientCache::remember(self::CACHE_KEY, $ttl, fn () => $this->buildSnapshot());
        } catch (Throwable $e) {
            Log::warning('service_availability cache read failed', ['error' => $e->getMessage()]);

            return $this->buildSnapshot();
        }
    }

    public function state(string $key): array
    {
        $snapshot = $this->resolve();

        return $snapshot[$key] ?? $this->fallbackAvailable($key);
    }

    public function isAvailable(string $key): bool
    {
        return (bool) ($this->state($key)['available'] ?? true);
    }

    /**
     * Throws ServiceUnavailableException (HTTP 503) when the overlay itself
     * says the key is down (DB row status ≠ available or env override). We
     * deliberately IGNORE the legacy-gate adapter here so the legacy gate's
     * existing 422 semantics keep firing (plan §12 decision). The adapter
     * OR-composition is used in the public status endpoint / banner only.
     *
     * When enforcement_enabled is false in config, this is a no-op (rollback).
     */
    public function assertAvailable(string $key, array $ctx = []): void
    {
        if (!config('service_availability.enforcement_enabled', true)) {
            return;
        }

        $row = ServiceState::query()->where('service_key', $key)->first();
        $status = $row?->status ?? 'available';

        $envEmergency = (bool) config('service_availability.emergency_write_lock', false);
        $envPublicTxDown = (bool) config('service_availability.public_transactions_disabled', false);
        $group = config("service_availability.keys.$key.group", 'public');

        $down = $status !== 'available'
            || $envEmergency
            || ($envPublicTxDown && $group === 'public' && $key !== 'marketing_site');

        if (!$down) {
            return;
        }

        throw new ServiceUnavailableException(
            serviceKey: $key,
            state: $row,
            message: $row?->public_message ?: null,
        );
    }

    /**
     * Read model rows keyed by service_key. Bypasses cache — used by the
     * admin index endpoint and for building the resolved snapshot.
     *
     * @return array<string, ServiceState>
     */
    public function rows(): array
    {
        return ServiceState::query()->get()->keyBy('service_key')->all();
    }

    // ------------------------------------------------------------------
    // Write paths
    // ------------------------------------------------------------------

    /**
     * Update a single service_states row + open/close incident as needed +
     * audit + bust cache.
     *
     * $attrs keys: status, reason_type, public_message, internal_note,
     *              alternatives, starts_at, ends_at, notify_enabled,
     *              allow_existing_operations, allow_admin_bypass.
     */
    public function setState(
        string $key,
        array $attrs,
        ?User $actor = null,
        ?Request $request = null,
    ): ServiceState {
        return DB::transaction(function () use ($key, $attrs, $actor, $request) {
            $state = ServiceState::query()->firstOrNew(['service_key' => $key]);
            $old = $state->exists ? $state->only([
                'status', 'reason_type', 'public_message', 'internal_note',
                'alternatives', 'starts_at', 'ends_at', 'notify_enabled',
                'current_incident_id', 'allow_existing_operations', 'allow_admin_bypass',
            ]) : [];

            if (!$state->exists) {
                $state->service_key = $key;
                $state->group = config("service_availability.keys.$key.group", 'public');
                $state->status = 'available';
            }

            foreach ([
                'status', 'reason_type', 'public_message', 'internal_note',
                'alternatives', 'starts_at', 'ends_at', 'notify_enabled',
                'allow_existing_operations', 'allow_admin_bypass',
            ] as $attr) {
                if (array_key_exists($attr, $attrs)) {
                    $state->{$attr} = $attrs[$attr];
                }
            }

            $prevStatus = $old['status'] ?? 'available';
            $newStatus = $state->status;

            // Manage incident lifecycle.
            if ($prevStatus === 'available' && $newStatus !== 'available') {
                $incident = ServiceIncident::query()->create([
                    'service_key' => $key,
                    'incident_type' => $state->reason_type ?? $this->reasonTypeFromStatus($newStatus),
                    'status' => 'open',
                    'public_message' => $state->public_message,
                    'internal_note' => $state->internal_note,
                    'started_at' => now(),
                    'scheduled_end_at' => $state->ends_at,
                    'created_by' => $actor?->id,
                ]);
                $state->current_incident_id = $incident->id;
            } elseif ($prevStatus !== 'available' && $newStatus === 'available') {
                if ($state->current_incident_id) {
                    ServiceIncident::query()->where('id', $state->current_incident_id)
                        ->where('status', 'open')
                        ->update([
                            'status' => 'restored',
                            'restored_at' => now(),
                            'restored_by' => $actor?->id,
                        ]);
                }
                $state->current_incident_id = null;
            }

            $state->changed_by = $actor?->id;
            $state->save();

            // AuditLogService reads the user from the passed Request only.
            // Record actor + request context in a single write so console/CLI
            // callers still get the user_id (Request::user() is null there).
            AuditLog::create([
                'user_id' => $actor?->id,
                'action' => 'service_availability.state_changed',
                'model_type' => ServiceState::class,
                'model_id' => $state->id,
                'old_values' => $old ?: null,
                'new_values' => $state->only([
                    'status', 'reason_type', 'public_message', 'internal_note',
                    'alternatives', 'starts_at', 'ends_at', 'notify_enabled',
                    'current_incident_id', 'allow_existing_operations', 'allow_admin_bypass',
                ]),
                'meta' => ['service_key' => $key],
                'ip_address' => $request?->ip(),
                'user_agent' => $request?->userAgent(),
            ]);

            $this->bustCache();

            return $state;
        });
    }

    /**
     * Apply a named preset atomically. $preset must be a key of
     * config('service_availability.presets').
     *
     * @return array<int, ServiceState>
     */
    public function applyPreset(
        string $preset,
        ?User $actor = null,
        ?Request $request = null,
        ?string $reason = null,
    ): array {
        $definitions = config("service_availability.presets.$preset");
        if (!is_array($definitions) || $definitions === []) {
            throw new \InvalidArgumentException("Unknown preset: {$preset}");
        }

        $applied = [];
        DB::transaction(function () use ($definitions, $actor, $request, $reason, &$applied) {
            foreach ($definitions as $key => $status) {
                $applied[] = $this->setState(
                    key: $key,
                    attrs: [
                        'status' => $status,
                        'reason_type' => $status === 'emergency_disabled' ? 'emergency' : 'technical_maintenance',
                        'internal_note' => $reason,
                    ],
                    actor: $actor,
                    request: $request,
                );
            }
        });

        return $applied;
    }

    public function bustCache(): void
    {
        try {
            ResilientCache::forget(self::CACHE_KEY);
        } catch (Throwable $e) {
            Log::warning('service_availability cache forget failed', ['error' => $e->getMessage()]);
        }
    }

    // ------------------------------------------------------------------
    // Snapshot construction
    // ------------------------------------------------------------------

    /**
     * @return array<string, array<string, mixed>>
     */
    private function buildSnapshot(): array
    {
        $keys = config('service_availability.keys', []);
        $rows = $this->rows();
        $envEmergency = (bool) config('service_availability.emergency_write_lock', false);
        $envPublicTxDown = (bool) config('service_availability.public_transactions_disabled', false);

        $snapshot = [];
        foreach ($keys as $key => $meta) {
            $row = $rows[$key] ?? null;
            $snapshot[$key] = $this->composeState($key, $meta, $row, $envEmergency, $envPublicTxDown);
        }

        return $snapshot;
    }

    /**
     * @param array{group?: string, adapter?: ?string, label?: string} $meta
     */
    private function composeState(
        string $key,
        array $meta,
        ?ServiceState $row,
        bool $envEmergency,
        bool $envPublicTxDown,
    ): array {
        $group = $meta['group'] ?? 'public';
        $status = $row?->status ?? 'available';
        $reasonType = $row?->reason_type;
        $publicMessage = $row?->public_message;
        $alternatives = $row?->alternatives ?? [];
        $allowExisting = $row?->allow_existing_operations ?? true;
        $allowBypass = $row?->allow_admin_bypass ?? true;
        $startsAt = $row?->starts_at?->toIso8601String();
        $endsAt = $row?->ends_at?->toIso8601String();
        $notify = $row?->notify_enabled ?? true;
        $incidentId = $row?->current_incident_id;
        $source = $row ? 'db' : 'default';

        $available = ($status === 'available');

        // Layer: adapter — OR with legacy gate for public online/delivery/catering.
        if ($available && ($meta['adapter'] ?? null) !== null) {
            $adapterClosed = $this->legacyGateClosed($meta['adapter']);
            if ($adapterClosed !== null) {
                $available = !$adapterClosed['closed'];
                if (!$available) {
                    $status = 'unavailable';
                    $reasonType = $reasonType ?: 'operational_pause';
                    $publicMessage = $publicMessage ?: $adapterClosed['message'];
                    $source = 'legacy_gate';
                }
            }
        }

        // Env master flags — highest precedence, cannot be bypassed via DB.
        if ($envEmergency && $group === 'internal') {
            $available = false;
            $status = 'emergency_disabled';
            $reasonType = 'emergency';
            $publicMessage = $publicMessage ?: 'Emergency lockdown in effect.';
            $source = 'env';
        }

        if ($envEmergency && $group === 'public') {
            $available = false;
            $status = 'emergency_disabled';
            $reasonType = 'emergency';
            $publicMessage = $publicMessage ?: 'Service temporarily unavailable.';
            $source = 'env';
        }

        if ($envPublicTxDown && $group === 'public' && $key !== 'marketing_site') {
            $available = false;
            $status = $status === 'available' ? 'unavailable' : $status;
            $reasonType = $reasonType ?: 'technical_maintenance';
            $publicMessage = $publicMessage ?: 'Online transactions are temporarily unavailable.';
            $source = 'env';
        }

        return [
            'service_key' => $key,
            'group' => $group,
            'status' => $status,
            'available' => $available,
            'reason_type' => $reasonType,
            'public_message' => $publicMessage,
            'alternatives' => is_array($alternatives) ? $alternatives : [],
            'allow_existing_operations' => (bool) $allowExisting,
            'allow_admin_bypass' => (bool) $allowBypass,
            'starts_at' => $startsAt,
            'ends_at' => $endsAt,
            'notify_enabled' => (bool) $notify,
            'current_incident_id' => $incidentId,
            'source' => $source,
        ];
    }

    /**
     * @return array{closed: bool, message: string}|null
     */
    private function legacyGateClosed(string $adapter): ?array
    {
        try {
            switch ($adapter) {
                case 'online':
                    $status = $this->onlineGate->status();

                    return [
                        'closed' => !(bool) ($status['open'] ?? true),
                        'message' => (string) ($status['message'] ?? ''),
                    ];
                case 'delivery':
                    $status = $this->deliveryGate->status();

                    return [
                        'closed' => !(bool) ($status['delivery_open'] ?? true),
                        'message' => (string) ($status['message'] ?? ''),
                    ];
                case 'catering':
                    $status = $this->cateringGate->status();

                    return [
                        'closed' => !(bool) ($status['open'] ?? true),
                        'message' => (string) ($status['message'] ?? ''),
                    ];
            }
        } catch (Throwable $e) {
            Log::warning('service_availability legacy gate failed', ['adapter' => $adapter, 'error' => $e->getMessage()]);
        }

        return null;
    }

    private function fallbackAvailable(string $key): array
    {
        return [
            'service_key' => $key,
            'group' => config("service_availability.keys.$key.group", 'public'),
            'status' => 'available',
            'available' => true,
            'reason_type' => null,
            'public_message' => null,
            'alternatives' => [],
            'allow_existing_operations' => true,
            'allow_admin_bypass' => true,
            'starts_at' => null,
            'ends_at' => null,
            'notify_enabled' => true,
            'current_incident_id' => null,
            'source' => 'unknown_key_default',
        ];
    }

    private function reasonTypeFromStatus(string $status): string
    {
        return match ($status) {
            'operational_pause' => 'operational_pause',
            'scheduled_maintenance' => 'scheduled',
            'emergency_disabled' => 'emergency',
            default => 'technical_maintenance',
        };
    }
}
