<?php

declare(strict_types=1);

namespace App\Domains\Reservations\Listeners;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Reservations\Events\ReservationConfirmed;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

class SendReservationConfirmedListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public int $tries = 3;

    public int $backoff = 5;

    public function __construct(private SmsService $sms) {}

    public function handle(ReservationConfirmed $event): void
    {
        $res = $event->reservation;

        try {
            $date = $res->date->format('d M Y');
            $time = substr((string) $res->time_slot, 0, 5);

            $this->sms->send(new SmsMessage(
                to: $res->customer_phone,
                message: "Reservation confirmed for {$res->party_size} on {$date} at {$time}. Ref #{$res->id}.",
                type: 'transactional',
                customerId: $res->customer_id,
                referenceType: 'reservation',
                referenceId: (string) $res->id,
                idempotencyKey: "reservation:confirmed:{$res->id}",
            ));
        } catch (\Throwable $e) {
            Log::error('SendReservationConfirmedListener failed', [
                'reservation_id' => $res->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
