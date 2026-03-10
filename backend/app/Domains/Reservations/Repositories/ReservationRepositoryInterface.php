<?php

declare(strict_types=1);

namespace App\Domains\Reservations\Repositories;

use App\Models\Reservation;
use Illuminate\Support\Collection;

interface ReservationRepositoryInterface
{
    public function findById(int $id): ?Reservation;

    public function findByToken(string $token): ?Reservation;

    /** Reservations for a specific date (active statuses only). */
    public function forDate(string $date): Collection;

    /** Reservations for a customer. */
    public function forCustomer(int $customerId, int $limit = 20): Collection;

    /** All reservations paginated (staff use). */
    public function paginated(array $filters = [], int $perPage = 20): \Illuminate\Contracts\Pagination\LengthAwarePaginator;

    public function create(array $data): Reservation;

    public function updateStatus(int $id, string $status): bool;

    /** Reservations that passed their time slot without being seated. */
    public function overdueUnseated(int $minutesGrace): Collection;
}
