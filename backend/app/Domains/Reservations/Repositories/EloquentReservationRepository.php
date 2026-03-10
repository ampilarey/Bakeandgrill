<?php

declare(strict_types=1);

namespace App\Domains\Reservations\Repositories;

use App\Models\Reservation;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

class EloquentReservationRepository implements ReservationRepositoryInterface
{
    public function findById(int $id): ?Reservation
    {
        return Reservation::find($id);
    }

    public function findByToken(string $token): ?Reservation
    {
        return Reservation::where('tracking_token', $token)->first();
    }

    public function forDate(string $date): Collection
    {
        return Reservation::where('date', $date)
            ->whereNotIn('status', ['cancelled', 'no_show'])
            ->with(['table', 'customer'])
            ->orderBy('time_slot')
            ->get();
    }

    public function forCustomer(int $customerId, int $limit = 20): Collection
    {
        return Reservation::where('customer_id', $customerId)
            ->orderByDesc('date')
            ->limit($limit)
            ->get();
    }

    public function paginated(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        $query = Reservation::with(['table', 'customer'])->orderByDesc('date')->orderBy('time_slot');

        if (!empty($filters['date'])) {
            $query->where('date', $filters['date']);
        }

        if (!empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        return $query->paginate($perPage);
    }

    public function create(array $data): Reservation
    {
        return Reservation::create($data);
    }

    public function updateStatus(int $id, string $status): bool
    {
        return (bool) Reservation::where('id', $id)->update(['status' => $status]);
    }

    public function overdueUnseated(int $minutesGrace): Collection
    {
        return Reservation::whereIn('status', ['pending', 'confirmed'])
            ->whereDate('date', today())
            ->whereRaw("TIME(time_slot) < TIME(DATE_SUB(NOW(), INTERVAL ? MINUTE))", [$minutesGrace])
            ->get();
    }
}
