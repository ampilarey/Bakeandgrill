<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\System\Services\ServiceAvailabilityService;
use App\Models\AuditLog;
use App\Models\ServiceState;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Flip service_states rows in/out of scheduled maintenance based on
 * `starts_at` / `ends_at` (plan §8 / Stage 7).
 *
 * Two idempotent branches, both driven by wall-clock:
 *
 *  1. ACTIVATE — a row with status=available whose starts_at is in the
 *     past AND either ends_at is null or in the future is flipped to
 *     `unavailable` (technical_maintenance reason). This is the "the
 *     window opened; put the service down" path.
 *
 *  2. RESTORE — a row with status != available whose ends_at is in
 *     the past is flipped back to available WITHOUT dispatching the
 *     restoration SMS (plan §14: auto-schedule end never sends SMS —
 *     operators explicitly send those via the notify endpoint).
 *
 * Missed-run safe: activation only requires starts_at ≤ now and
 * status still available; restoration only requires ends_at ≤ now
 * and status still non-available. A skipped cron minute is picked
 * up on the next tick.
 *
 * Runs every minute from routes/console.php with withoutOverlapping.
 */
class ActivateScheduledServiceStates extends Command
{
    protected $signature = 'service-availability:activate-scheduled';

    protected $description = 'Activate/restore service_states rows whose starts_at/ends_at window elapsed.';

    public function __construct(private readonly ServiceAvailabilityService $availability)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $now = now();

        $activated = $this->activateWindows($now);
        $restored = $this->restoreWindows($now);

        $this->info("Activated {$activated}, restored {$restored}.");

        return self::SUCCESS;
    }

    private function activateWindows(\Illuminate\Support\Carbon $now): int
    {
        $rows = ServiceState::query()
            ->where('status', 'available')
            ->whereNotNull('starts_at')
            ->where('starts_at', '<=', $now)
            ->where(function ($q) use ($now) {
                $q->whereNull('ends_at')->orWhere('ends_at', '>', $now);
            })
            ->get();

        $count = 0;
        foreach ($rows as $row) {
            DB::transaction(function () use ($row) {
                $this->availability->setState(
                    key: $row->service_key,
                    attrs: [
                        'status' => 'unavailable',
                        'reason_type' => $row->reason_type ?: 'scheduled',
                    ],
                );

                AuditLog::create([
                    'action' => 'service_availability.scheduled_activated',
                    'model_type' => ServiceState::class,
                    'model_id' => $row->id,
                    'new_values' => ['status' => 'unavailable'],
                    'meta' => [
                        'service_key' => $row->service_key,
                        'starts_at' => $row->starts_at?->toIso8601String(),
                        'ends_at' => $row->ends_at?->toIso8601String(),
                    ],
                ]);
            });
            $count++;
        }

        return $count;
    }

    private function restoreWindows(\Illuminate\Support\Carbon $now): int
    {
        $rows = ServiceState::query()
            ->where('status', '!=', 'available')
            ->whereNotNull('ends_at')
            ->where('ends_at', '<=', $now)
            ->get();

        $count = 0;
        foreach ($rows as $row) {
            DB::transaction(function () use ($row) {
                $this->availability->setState(
                    key: $row->service_key,
                    attrs: [
                        'status' => 'available',
                        'reason_type' => null,
                        'public_message' => null,
                        // Clear the schedule so we don't re-activate the next tick.
                        'starts_at' => null,
                        'ends_at' => null,
                    ],
                );

                AuditLog::create([
                    'action' => 'service_availability.scheduled_restored',
                    'model_type' => ServiceState::class,
                    'model_id' => $row->id,
                    'new_values' => ['status' => 'available'],
                    'meta' => [
                        'service_key' => $row->service_key,
                        'auto_sms_dispatched' => false,
                    ],
                ]);
            });
            $count++;
        }

        return $count;
    }
}
