<?php

declare(strict_types=1);

namespace Tests\Unit\Reservations;

use App\Domains\Reservations\Repositories\EloquentReservationRepository;
use App\Models\Reservation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OverdueUnseatedQueryTest extends TestCase
{
    use RefreshDatabase;

    public function test_overdue_unseated_returns_only_past_slots_for_today(): void
    {
        $repo = app(EloquentReservationRepository::class);
        $today = today()->toDateString();
        $now = now();

        // Within the grace window after midnight no slot today can be overdue yet.
        if ($now->lt(today()->addMinutes(20))) {
            $this->markTestSkipped('No overdue slot can exist this close to midnight.');
        }

        // Clamp both slots inside today — "2 hours ago/ahead" crosses the date
        // boundary near midnight and would silently test the wrong day.
        $overdueAt = $now->copy()->subHours(2);
        if (!$overdueAt->isSameDay($now)) {
            $overdueAt = $now->copy()->startOfDay();
        }
        $futureAt = $now->copy()->addHours(2);
        if (!$futureAt->isSameDay($now)) {
            $futureAt = $now->copy()->endOfDay();
        }

        $overdueSlot = $overdueAt->format('H:i:s');
        $futureSlot = $futureAt->format('H:i:s');

        $overdue = Reservation::create([
            'customer_name' => 'Late Guest',
            'customer_phone' => '+9607001001',
            'party_size' => 2,
            'date' => $today,
            'time_slot' => $overdueSlot,
            'status' => 'confirmed',
        ]);

        Reservation::create([
            'customer_name' => 'Future Guest',
            'customer_phone' => '+9607001002',
            'party_size' => 4,
            'date' => $today,
            'time_slot' => $futureSlot,
            'status' => 'confirmed',
        ]);

        Reservation::create([
            'customer_name' => 'Seated Guest',
            'customer_phone' => '+9607001003',
            'party_size' => 2,
            'date' => $today,
            'time_slot' => $overdueSlot,
            'status' => 'seated',
        ]);

        $results = $repo->overdueUnseated(15);

        $this->assertCount(1, $results);
        $this->assertSame($overdue->id, $results->first()->id);
    }
}
