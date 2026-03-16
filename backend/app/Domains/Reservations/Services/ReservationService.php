<?php

declare(strict_types=1);

namespace App\Domains\Reservations\Services;

use App\Domains\Reservations\DTOs\CreateReservationData;
use App\Domains\Reservations\DTOs\ReservationSlotData;
use App\Domains\Reservations\Events\ReservationCreated;
use App\Domains\Reservations\Repositories\ReservationRepositoryInterface;
use App\Models\Reservation;
use App\Models\ReservationSetting;
use App\Models\RestaurantTable;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class ReservationService
{
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
        $settings   = ReservationSetting::current();
        $parsedDate = Carbon::parse($date);

        if ($parsedDate->isPast() && !$parsedDate->isToday()) {
            return [];
        }

        if ($parsedDate->diffInDays(now()) > $settings->advance_booking_days) {
            return [];
        }

        $slots = $this->generateSlots($settings);
        $existing = $this->reservations->forDate($date);
        $totalCapacity = RestaurantTable::where('is_active', true)->sum('capacity');

        $result = [];

        foreach ($slots as $slot) {
            $bookedForSlot = $existing->filter(fn(Reservation $r) =>
                $r->time_slot === $slot &&
                !in_array($r->status, ['cancelled', 'no_show'], true)
            );

            $bookedPartySize = $bookedForSlot->sum('party_size');
            $remaining = max(0, (int) $totalCapacity - $bookedPartySize);

            // Skip past slots for today
            if ($parsedDate->isToday()) {
                $slotTime = Carbon::parse($date . ' ' . $slot);
                if ($slotTime->isPast()) {
                    continue;
                }
            }

            $result[] = new ReservationSlotData(
                timeSlot:          $slot,
                available:         $remaining >= $partySize,
                remainingCapacity: $remaining,
            );
        }

        return $result;
    }

    public function create(CreateReservationData $data): Reservation
    {
        $reservation = $this->reservations->create([
            'customer_id'    => $data->customerId,
            'customer_name'  => $data->customerName,
            'customer_phone' => $data->customerPhone,
            'party_size'     => $data->partySize,
            'date'           => $data->date,
            'time_slot'      => $data->timeSlot,
            'duration_minutes' => ReservationSetting::current()->slot_duration_minutes,
            'notes'          => $data->notes,
            'status'         => 'pending',
            'tracking_token' => Str::random(32),
        ]);

        // Auto-assign an available table
        $this->tryAssignTable($reservation);

        ReservationCreated::dispatch($reservation->fresh());

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

        $this->reservations->updateStatus($id, $status);

        return $reservation->fresh();
    }

    public function cancel(int $id, ?int $requestingCustomerId = null): void
    {
        $reservation = $this->reservations->findById($id);

        if (!$reservation) {
            throw new \InvalidArgumentException("Reservation #{$id} not found.");
        }

        if ($requestingCustomerId !== null && $reservation->customer_id !== $requestingCustomerId) {
            throw new \RuntimeException('Not authorised to cancel this reservation.');
        }

        if (in_array($reservation->status, ['completed', 'no_show'], true)) {
            throw new \RuntimeException('Cannot cancel a completed or no-show reservation.');
        }

        $this->reservations->updateStatus($id, 'cancelled');
    }

    public function markNoShows(int $minutesGrace): int
    {
        $overdue = $this->reservations->overdueUnseated($minutesGrace);
        $count   = 0;

        foreach ($overdue as $reservation) {
            $this->reservations->updateStatus($reservation->id, 'no_show');
            $count++;
        }

        return $count;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function generateSlots(ReservationSetting $settings): array
    {
        $slots    = [];
        // Use DB-stored opening/closing times; fall back to 09:00–22:00 if not set
        [$openH, $openM]  = array_map('intval', explode(':', $settings->opening_time ?? '09:00'));
        [$closeH, $closeM] = array_map('intval', explode(':', $settings->closing_time ?? '22:00'));
        $start    = Carbon::createFromTime($openH, $openM);
        $end      = Carbon::createFromTime($closeH, $closeM);
        $interval = $settings->slot_duration_minutes + $settings->buffer_minutes_between;

        while ($start->lte($end)) {
            $slots[] = $start->format('H:i:s');
            $start->addMinutes($interval);
        }

        return $slots;
    }

    private function tryAssignTable(Reservation $reservation): void
    {
        $tables = RestaurantTable::where('is_active', true)
            ->where('capacity', '>=', $reservation->party_size)
            ->orderBy('capacity')
            ->get();

        $existing = $this->reservations->forDate($reservation->date->toDateString());

        foreach ($tables as $table) {
            $hasConflict = $existing->contains(fn(Reservation $r) =>
                $r->id !== $reservation->id &&
                $r->table_id === $table->id &&
                $r->time_slot === $reservation->time_slot &&
                !in_array($r->status, ['cancelled', 'no_show'], true)
            );

            if (!$hasConflict) {
                $reservation->update(['table_id' => $table->id]);

                return;
            }
        }
    }
}
