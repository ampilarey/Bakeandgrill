<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Reservations\DTOs\CreateReservationData;
use App\Domains\Reservations\Repositories\ReservationRepositoryInterface;
use App\Domains\Reservations\Services\ReservationService;
use App\Models\ReservationSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class ReservationController extends Controller
{
    public function __construct(
        private ReservationService              $service,
        private ReservationRepositoryInterface  $reservations,
    ) {}

    // ── Public: availability ─────────────────────────────────────────────────

    public function availability(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'date'       => ['required', 'date', 'after_or_equal:today'],
            'party_size' => ['required', 'integer', 'min:1', 'max:20'],
        ]);

        $slots = $this->service->availableSlots($validated['date'], (int) $validated['party_size']);

        return response()->json([
            'slots' => array_map(fn($s) => [
                'time_slot'          => substr($s->timeSlot, 0, 5),
                'available'          => $s->available,
                'remaining_capacity' => $s->remainingCapacity,
            ], $slots),
        ]);
    }

    // ── Create reservation (customer or guest) ────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'customer_name'  => ['required', 'string', 'max:120'],
            'customer_phone' => ['required', 'string', 'max:20'],
            'party_size'     => ['required', 'integer', 'min:1', 'max:20'],
            'date'           => ['required', 'date', 'after_or_equal:today'],
            'time_slot'      => ['required', 'string', 'regex:/^\d{2}:\d{2}$/'],
            'notes'          => ['nullable', 'string', 'max:500'],
        ]);

        $customerId = $request->user()?->id; // null for guest bookings

        $reservation = $this->service->create(new CreateReservationData(
            customerName:  $validated['customer_name'],
            customerPhone: $validated['customer_phone'],
            partySize:     (int) $validated['party_size'],
            date:          $validated['date'],
            timeSlot:      $validated['time_slot'] . ':00',
            notes:         $validated['notes'] ?? null,
            customerId:    $customerId,
        ));

        return response()->json(['reservation' => $this->format($reservation)], 201);
    }

    // ── List reservations ────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // Customer sees own reservations only
        if ($user?->tokenCan('customer')) {
            $items = $this->reservations->forCustomer($user->id);

            return response()->json(['data' => $items->map(fn($r) => $this->format($r))]);
        }

        // Staff sees all, paginated
        $validated = $request->validate([
            'date'     => ['nullable', 'date'],
            'status'   => ['nullable', 'string'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $paginator = $this->reservations->paginated(
            filters: array_filter($validated, fn($v) => $v !== null),
            perPage: (int) ($validated['per_page'] ?? 20),
        );

        return response()->json([
            'data' => collect($paginator->items())->map(fn($r) => $this->format($r)),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'total'        => $paginator->total(),
            ],
        ]);
    }

    // ── Update status (staff only) ────────────────────────────────────────────

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'in:pending,confirmed,seated,completed,cancelled,no_show'],
        ]);

        $reservation = $this->service->updateStatus($id, $validated['status']);

        return response()->json(['reservation' => $this->format($reservation)]);
    }

    // ── Cancel ────────────────────────────────────────────────────────────────

    public function destroy(Request $request, int $id): JsonResponse
    {
        $customerId = $request->user()?->tokenCan('customer')
            ? $request->user()->id
            : null;

        $this->service->cancel($id, $customerId);

        return response()->json(['message' => 'Reservation cancelled.']);
    }

    // ── Settings (staff only) ─────────────────────────────────────────────────

    public function getSettings(): JsonResponse
    {
        return response()->json(['settings' => ReservationSetting::current()]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'slot_duration_minutes'  => ['sometimes', 'integer', 'min:15', 'max:240'],
            'max_party_size'         => ['sometimes', 'integer', 'min:1', 'max:50'],
            'advance_booking_days'   => ['sometimes', 'integer', 'min:1', 'max:365'],
            'buffer_minutes_between' => ['sometimes', 'integer', 'min:0', 'max:120'],
            'auto_cancel_minutes'    => ['sometimes', 'integer', 'min:5', 'max:120'],
            'opening_time'           => ['sometimes', 'date_format:H:i'],
            'closing_time'           => ['sometimes', 'date_format:H:i', 'after:opening_time'],
        ]);

        $settings = ReservationSetting::current();
        $settings->update($validated);

        return response()->json(['settings' => $settings->fresh()]);
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private function format(\App\Models\Reservation $r): array
    {
        return [
            'id'             => $r->id,
            'customer_name'  => $r->customer_name,
            'customer_phone' => $r->customer_phone,
            'party_size'     => $r->party_size,
            'date'           => $r->date->toDateString(),
            'time_slot'      => substr($r->time_slot, 0, 5),
            'duration_minutes' => $r->duration_minutes,
            'status'         => $r->status,
            'notes'          => $r->notes,
            'table'          => $r->table ? ['id' => $r->table->id, 'name' => $r->table->name] : null,
            'tracking_token' => $r->tracking_token,
            'created_at'     => $r->created_at,
        ];
    }
}
