<?php

declare(strict_types=1);

namespace App\Domains\Reservations\Listeners;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Reservations\Events\ReservationCancelled;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

/** The guest hears that the booking is off, whoever cancelled it (ops audit, 2026-09-25). */
class SendReservationCancelledListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public int $tries = 3;

    public int $backoff = 5;

    public function __construct(private SmsService $sms) {}

    public function handle(ReservationCancelled $event): void
    {
        $res = $event->reservation;

        try {
            $date = $res->date->format('d M Y');
            $time = substr((string) $res->time_slot, 0, 5);
            $line = $event->by === 'customer'
                ? "Your reservation for {$res->party_size} on {$date} at {$time} is cancelled as requested. Ref #{$res->id}."
                : "Sorry, your reservation for {$res->party_size} on {$date} at {$time} has been cancelled. Please call us to rebook. Ref #{$res->id}.";

            $this->sms->send(new SmsMessage(
                to: $res->customer_phone,
                message: $line,
                type: 'reservation_cancelled',
                customerId: $res->customer_id,
                referenceType: 'reservation',
                referenceId: (string) $res->id,
                idempotencyKey: "reservation:cancelled:{$res->id}",
            ));
        } catch (\Throwable $e) {
            Log::error('SendReservationCancelledListener failed', ['reservation_id' => $res->id, 'error' => $e->getMessage()]);
        }
    }
}
