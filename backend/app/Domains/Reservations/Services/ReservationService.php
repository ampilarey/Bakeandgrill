<?php

declare(strict_types=1);

namespace App\Domains\Reservations\Services;

use App\Domains\Reservations\DTOs\CreateReservationData;
use App\Domains\Reservations\DTOs\ReservationSlotData;
use App\Domains\Reservations\Events\ReservationConfirmed;
use App\Domains\Reservations\Events\ReservationCreated;
use App\Domains\Reservations\Repositories\ReservationRepositoryInterface;
use App\Models\Reservation;
use App\Models\ReservationSetting;
use App\Models\RestaurantTable;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ReservationService
{
    /**
     * Staff UI transition map — also enforced server-side.
     * Auto no-show job bypasses this via repository::updateStatus.
     *
     * @var array<string, list<string>>
     */
    public const NEXT_STATUSES = [
        'pending' => ['confirmed', 'cancelled'],
        'confirmed' => ['seated', 'no_show', 'cancelled'],
        'seated' => ['completed'],
        'completed' => [],
        'cancelled' => [],
        'no_show' => [],
    ];

    public function __construct(
        private ReservationRepositoryInterface $reservations,
    ) {}

    /**
     * Return available time slots for a given date and party size.
     *
     * @return ReservationSlotData[]
     */
    public function availableSlots(string $date, int $partySize): array
    {
        $settings = ReservationSetting::current();
        $parsedDate = Carbon::parse($date);

        if ($parsedDate->isPast() && !$parsedDate->isToday()) {
            return [];
        }

        if ($parsedDate->diffInDays(now()) > $settings->advance_booking_days) {
            return [];
        }

        $slots = $this->generateSlots($settings);
        $existing = $this->reservations->forDate($date);
        $totalCapacity = $this->totalActiveTableCapacity();

        $result = [];

        foreach ($slots as $slot) {
            $remaining = $this->remainingCapacityForSlot($slot, $existing, $totalCapacity);

            // Skip past slots for today
            if ($parsedDate->isToday()) {
                $slotTime = Carbon::parse($date . ' ' . $slot);
                if ($slotTime->isPast()) {
                    continue;
                }
            }

            $result[] = new ReservationSlotData(
                timeSlot: $slot,
                available: $remaining >= $partySize,
                remainingCapacity: $remaining,
            );
        }

        return $result;
    }

    /**
     * Table hold for a prepaid dine-in order (customer paid at checkout).
     *
     * Runs the same capacity check as create() and REQUIRES a table to be
     * assignable — the customer is paying now, so "no table" must fail the
     * checkout before money moves, not surprise them at the door. Created
     * as pending; ConfirmReservationOnOrderPaidListener confirms on payment.
     * No ReservationCreated dispatch — its "we'll confirm shortly" SMS is
     * wrong for a booking that auto-confirms the moment payment lands.
     */
    public function createForPrepaidDineIn(
        \App\Models\Order $order,
        int $partySize,
        Carbon $arrival,
        ?\App\Models\Customer $customer,
    ): Reservation {
        return DB::transaction(function () use ($order, $partySize, $arrival, $customer): Reservation {
            $locked = Reservation::query()
                ->whereDate('date', $arrival->toDateString())
                ->whereNotIn('status', ['cancelled', 'no_show'])
                ->lockForUpdate()
                ->get();

            $timeSlot = $arrival->format('H:i:s');
            $remaining = $this->remainingCapacityForSlot($timeSlot, $locked, $this->totalActiveTableCapacity());
            if ($partySize > $remaining) {
                throw ValidationException::withMessages([
                    'party_size' => ['No tables are free at that time. Please pick another arrival time.'],
                ]);
            }

            $reservation = $this->reservations->create([
                'customer_id' => $customer?->id,
                'customer_name' => $customer?->name ?: 'Online customer',
                'customer_phone' => $customer?->phone ?: '',
                'party_size' => $partySize,
                'date' => $arrival->toDateString(),
                'time_slot' => $timeSlot,
                'duration_minutes' => ReservationSetting::current()->slot_duration_minutes,
                'notes' => 'Prepaid dine-in order ' . ($order->order_number ?? ('#' . $order->id)),
                'status' => 'pending',
                'order_id' => $order->id,
                'tracking_token' => Str::random(32),
            ]);

            $this->tryAssignTable($reservation, $locked->push($reservation));
            $reservation->refresh();

            if ($reservation->table_id === null) {
                throw ValidationException::withMessages([
                    'party_size' => ["No table for {$partySize} people is free at that time. Please pick another arrival time."],
                ]);
            }

            return $reservation->fresh(['table', 'customer']) ?? $reservation;
        });
    }

    public function create(CreateReservationData $data): Reservation
    {
        $reservation = DB::transaction(function () use ($data): Reservation {
            // Lock existing active bookings for this date so concurrent
            // create() calls cannot both pass the capacity check.
            $locked = Reservation::query()
                ->whereDate('date', $data->date)
                ->whereNotIn('status', ['cancelled', 'no_show'])
                ->lockForUpdate()
                ->get();

            $remaining = $this->remainingCapacityForSlot(
                $data->timeSlot,
                $locked,
                $this->totalActiveTableCapacity(),
            );

            if ($data->partySize > $remaining) {
                throw ValidationException::withMessages([
                    'time_slot' => ['This time slot is fully booked.'],
                ]);
            }

            $reservation = $this->reservations->create([
                'customer_id' => $data->customerId,
                'customer_name' => $data->customerName,
                'customer_phone' => $data->customerPhone,
                'party_size' => $data->partySize,
                'date' => $data->date,
                'time_slot' => $data->timeSlot,
                'duration_minutes' => ReservationSetting::current()->slot_duration_minutes,
                'notes' => $data->notes,
                'status' => 'pending',
                'tracking_token' => Str::random(32),
            ]);

            $this->tryAssignTable($reservation, $locked->push($reservation));

            return $reservation->fresh(['table', 'customer']) ?? $reservation;
        });

        ReservationCreated::dispatch($reservation);

        return $reservation;
    }

    public function updateStatus(int $id, string $status): Reservation
    {
        $reservation = $this->reservations->findById($id);

        if (!$reservation) {
            throw new \InvalidArgumentException("Reservation #{$id} not found.");
        }

        $allowed = ['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'];

        if (!in_array($status, $allowed, true)) {
            throw new \InvalidArgumentException("Invalid status: {$status}");
        }

        $from = (string) $reservation->status;
        $next = self::NEXT_STATUSES[$from] ?? [];
        if (!in_array($status, $next, true)) {
            throw ValidationException::withMessages([
                'status' => ["Cannot transition from '{$from}' to '{$status}'."],
            ]);
        }

        $this->reservations->updateStatus($id, $status);
        $fresh = $reservation->fresh(['table', 'customer']);

        if ($status === 'confirmed' && $from !== 'confirmed' && $fresh) {
            ReservationConfirmed::dispatch($fresh);
        }

        return $fresh ?? $reservation;
    }

    public function cancel(int $id, ?int $requestingCustomerId = null, bool $isStaff = false): void
    {
        $reservation = $this->reservations->findById($id);

        if (!$reservation) {
            abort(404, "Reservation #{$id} not found.");
        }

        // Customers may only cancel their own reservations; staff bypass ownership check
        if (!$isStaff && $requestingCustomerId !== null && $reservation->customer_id !== $requestingCustomerId) {
            abort(403, 'Not authorised to cancel this reservation.');
        }

        if (in_array($reservation->status, ['completed', 'no_show'], true)) {
            abort(422, 'Cannot cancel a completed or no-show reservation.');
        }

        // Use repository directly so customer/staff cancel works from any
        // cancellable status without requiring the staff transition map.
        $this->reservations->updateStatus($id, 'cancelled');
    }

    public function markNoShows(int $minutesGrace): int
    {
        $overdue = $this->reservations->overdueUnseated($minutesGrace);
        $count = 0;

        foreach ($overdue as $reservation) {
            // Bypass NEXT_STATUSES — job may mark pending or confirmed → no_show.
            $this->reservations->updateStatus($reservation->id, 'no_show');
            $count++;
        }

        return $count;
    }

    /**
     * Shared capacity math used by availability() and create().
     * remaining = sum(active table capacities) − booked party sizes for the slot.
     *
     * @param Collection<int, Reservation> $existing
     */
    public function remainingCapacityForSlot(string $timeSlot, Collection $existing, ?int $totalCapacity = null): int
    {
        $totalCapacity ??= $this->totalActiveTableCapacity();
        $normalized = $this->normalizeTimeSlot($timeSlot);

        $bookedPartySize = $existing
            ->filter(function (Reservation $r) use ($normalized): bool {
                if (in_array($r->status, ['cancelled', 'no_show'], true)) {
                    return false;
                }

                return $this->normalizeTimeSlot((string) $r->time_slot) === $normalized;
            })
            ->sum('party_size');

        return max(0, $totalCapacity - (int) $bookedPartySize);
    }

    public function totalActiveTableCapacity(): int
    {
        return (int) RestaurantTable::query()->where('is_active', true)->sum('capacity');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function normalizeTimeSlot(string $slot): string
    {
        // Accept "12:00", "12:00:00", etc. → "HH:MM:SS"
        $parts = explode(':', $slot);
        $h = str_pad((string) ((int) ($parts[0] ?? 0)), 2, '0', STR_PAD_LEFT);
        $m = str_pad((string) ((int) ($parts[1] ?? 0)), 2, '0', STR_PAD_LEFT);
        $s = str_pad((string) ((int) ($parts[2] ?? 0)), 2, '0', STR_PAD_LEFT);

        return "{$h}:{$m}:{$s}";
    }

    /** @return list<string> */
    private function generateSlots(ReservationSetting $settings): array
    {
        $slots = [];
        // Use DB-stored opening/closing times; fall back to 09:00–22:00 if not set
        [$openH, $openM] = array_map('intval', explode(':', $settings->opening_time ?? '09:00'));
        [$closeH, $closeM] = array_map('intval', explode(':', $settings->closing_time ?? '22:00'));
        $start = Carbon::createFromTime($openH, $openM);
        $end = Carbon::createFromTime($closeH, $closeM);
        $interval = $settings->slot_duration_minutes + $settings->buffer_minutes_between;

        while ($start->lte($end)) {
            $slots[] = $start->format('H:i:s');
            $start->addMinutes($interval);
        }

        return $slots;
    }

    /**
     * @param Collection<int, Reservation>|null $existing
     */
    private function tryAssignTable(Reservation $reservation, ?Collection $existing = null): void
    {
        $tables = RestaurantTable::where('is_active', true)
            ->where('capacity', '>=', $reservation->party_size)
            ->orderBy('capacity')
            ->get();

        $existing ??= $this->reservations->forDate($reservation->date->toDateString());
        $slot = $this->normalizeTimeSlot((string) $reservation->time_slot);

        foreach ($tables as $table) {
            $hasConflict = $existing->contains(
                fn (Reservation $r) => $r->id !== $reservation->id &&
                $r->table_id === $table->id &&
                $this->normalizeTimeSlot((string) $r->time_slot) === $slot &&
                !in_array($r->status, ['cancelled', 'no_show'], true),
            );

            if (!$hasConflict) {
                $reservation->update(['table_id' => $table->id]);

                return;
            }
        }
    }
}
