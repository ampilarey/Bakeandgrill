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
use Illuminate\Validation\ValidationException;

class ReservationController extends Controller
{
    public function __construct(
        private ReservationService $service,
        private ReservationRepositoryInterface $reservations,
    ) {}

    // ── Public: availability ─────────────────────────────────────────────────

    public function availability(Request $request): JsonResponse
    {
        $maxParty = $this->effectiveMaxPartySize();

        $validated = $request->validate([
            'date' => ['required', 'date', 'after_or_equal:today'],
            'party_size' => ['required', 'integer', 'min:1', 'max:' . $maxParty],
        ]);

        // Owner kill switch: report closed with zero slots so the booking form
        // can say so instead of showing a fully-booked calendar.
        $accepting = app(\App\Services\FeatureGateService::class)->open('reservations');
        $slots = $accepting
            ? $this->service->availableSlots($validated['date'], (int) $validated['party_size'])
            : [];

        return response()->json([
            'slots' => array_map(fn ($s) => [
                'time_slot' => substr($s->timeSlot, 0, 5),
                'available' => $s->available,
                'remaining_capacity' => $s->remainingCapacity,
            ], $slots),
            'meta' => [
                'max_party_size' => $maxParty,
                'accepting' => $accepting,
            ],
        ]);
    }

    // ── Create reservation (customer or guest) ────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        app(\App\Services\FeatureGateService::class)->assertOpen(
            'reservations',
            'We are not taking new table bookings right now. Please call us instead.',
        );

        $maxParty = $this->effectiveMaxPartySize();

        $validated = $request->validate([
            'customer_name' => ['required', 'string', 'max:120'],
            'customer_phone' => ['required', 'string', 'max:20'],
            'party_size' => ['required', 'integer', 'min:1', 'max:' . $maxParty],
            'date' => ['required', 'date', 'after_or_equal:today'],
            'time_slot' => ['required', 'string', 'regex:/^\d{2}:\d{2}$/'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $actor = $request->user();
        $customerId = ($actor instanceof \App\Models\Customer) ? $actor->id : null;

        $reservation = $this->service->create(new CreateReservationData(
            customerName: $validated['customer_name'],
            customerPhone: $validated['customer_phone'],
            partySize: (int) $validated['party_size'],
            date: $validated['date'],
            timeSlot: $validated['time_slot'] . ':00',
            notes: $validated['notes'] ?? null,
            customerId: $customerId,
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

            return response()->json(['data' => $items->map(fn ($r) => $this->format($r))]);
        }

        // Staff sees all, paginated — requires reservations.manage permission
        if (!$user?->hasPermission('reservations.manage')) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $validated = $request->validate([
            'date' => ['nullable', 'date'],
            'status' => ['nullable', 'string'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $paginator = $this->reservations->paginated(
            filters: array_filter($validated, fn ($v) => $v !== null),
            perPage: (int) ($validated['per_page'] ?? 20),
        );

        return response()->json([
            'data' => collect($paginator->items())->map(fn ($r) => $this->format($r)),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    // ── Update status (staff only) ────────────────────────────────────────────

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'in:pending,confirmed,seated,completed,cancelled,no_show'],
        ]);

        try {
            $reservation = $this->service->updateStatus($id, $validated['status']);
        } catch (\InvalidArgumentException $e) {
            throw ValidationException::withMessages(['status' => [$e->getMessage()]]);
        }

        return response()->json(['reservation' => $this->format($reservation)]);
    }

    // ── Seat (staff only) ──────────────────────────────────────────────────────

    /**
     * POST /admin/reservations/{id}/seat
     *
     * Customer arrived: mark the booking seated and — for prepaid dine-in —
     * claim the held table for the already-paid order so the bill and the
     * seat travel together. Optional table_id reassigns on the spot (e.g.
     * the held table broke a leg).
     */
    public function seat(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'table_id' => ['nullable', 'integer', 'exists:restaurant_tables,id'],
        ]);

        $reservation = \App\Models\Reservation::with(['table', 'order'])->findOrFail($id);

        if ($reservation->status !== 'confirmed') {
            abort(422, "Reservation is {$reservation->status} — only confirmed bookings can be seated.");
        }

        $tableId = (int) ($validated['table_id'] ?? $reservation->table_id ?? 0);
        if ($tableId <= 0) {
            abort(422, 'Assign a table before seating this booking.');
        }

        $order = $reservation->order;

        \Illuminate\Support\Facades\DB::transaction(function () use ($reservation, $order, $tableId): void {
            if ($order !== null) {
                if (in_array($order->status, ['cancelled', 'refunded', 'completed'], true)) {
                    abort(422, "Linked order is {$order->status} and cannot be seated.");
                }
                \App\Models\RestaurantTable::claimForOrder($tableId, (int) $order->id);
                $order->update(['restaurant_table_id' => $tableId]);
            } else {
                // Plain booking without a prepaid order: just occupy the seat.
                if (\App\Models\RestaurantTable::findActiveOrder($tableId) !== null) {
                    abort(422, 'Table already has an open order.');
                }
                \App\Models\RestaurantTable::markOccupied($tableId);
            }

            $reservation->update(['status' => 'seated', 'table_id' => $tableId]);
        });

        $fresh = $reservation->fresh(['table', 'order']);

        return response()->json([
            'reservation' => $this->format($fresh ?? $reservation),
            'order_id' => $order?->id,
        ]);
    }

    // ── Cancel ────────────────────────────────────────────────────────────────

    public function destroy(Request $request, int $id): JsonResponse
    {
        $isCustomer = $request->user()?->tokenCan('customer');
        $isStaff = $request->user()?->tokenCan('staff');

        if ($isCustomer) {
            $customerId = $request->user()->id;
        } elseif ($isStaff) {
            // Staff must have reservations.manage permission to cancel any booking
            if (!$request->user()->hasPermission('reservations.manage')) {
                return response()->json(['message' => 'Forbidden.'], 403);
            }
            $customerId = null; // bypass ownership check — staff acting on behalf
        } else {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $this->service->cancel($id, $customerId, $isStaff);

        return response()->json(['message' => 'Reservation cancelled.']);
    }

    // ── Settings (staff only) ─────────────────────────────────────────────────

    public function getSettings(): JsonResponse
    {
        return response()->json(['settings' => $this->formatSettings(ReservationSetting::current())]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'slot_duration_minutes' => ['sometimes', 'integer', 'min:15', 'max:240'],
            'max_party_size' => ['sometimes', 'integer', 'min:1', 'max:50'],
            'advance_booking_days' => ['sometimes', 'integer', 'min:1', 'max:365'],
            'buffer_minutes_between' => ['sometimes', 'integer', 'min:0', 'max:120'],
            'auto_cancel_minutes' => ['sometimes', 'integer', 'min:5', 'max:120'],
            'opening_time' => ['sometimes', 'date_format:H:i'],
            'closing_time' => ['sometimes', 'date_format:H:i', 'after:opening_time'],
        ]);

        $settings = ReservationSetting::current();
        $settings->update($validated);

        return response()->json(['settings' => $this->formatSettings($settings->fresh() ?? $settings)]);
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private function effectiveMaxPartySize(): int
    {
        $max = (int) ReservationSetting::current()->max_party_size;

        return max(1, min(50, $max > 0 ? $max : 20));
    }

    /** @return array<string, mixed> */
    private function formatSettings(ReservationSetting $s): array
    {
        return [
            'id' => $s->id,
            'slot_duration_minutes' => (int) $s->slot_duration_minutes,
            'max_party_size' => (int) $s->max_party_size,
            'advance_booking_days' => (int) $s->advance_booking_days,
            'buffer_minutes_between' => (int) $s->buffer_minutes_between,
            'auto_cancel_minutes' => (int) $s->auto_cancel_minutes,
            'opening_time' => substr((string) ($s->opening_time ?? '09:00'), 0, 5),
            'closing_time' => substr((string) ($s->closing_time ?? '22:00'), 0, 5),
        ];
    }

    private function format(\App\Models\Reservation $r): array
    {
        return [
            'id' => $r->id,
            'customer_name' => $r->customer_name,
            'customer_phone' => $r->customer_phone,
            'party_size' => $r->party_size,
            'date' => $r->date->toDateString(),
            'time_slot' => substr($r->time_slot, 0, 5),
            'duration_minutes' => $r->duration_minutes,
            'status' => $r->status,
            'notes' => $r->notes,
            'table' => $r->table ? ['id' => $r->table->id, 'name' => $r->table->name] : null,
            // Prepaid dine-in: booking is backed by a paid online order.
            'order_id' => $r->order_id,
            'order_number' => $r->order_id ? $r->order?->order_number : null,
            'tracking_token' => $r->tracking_token,
            'created_at' => $r->created_at,
        ];
    }
}
