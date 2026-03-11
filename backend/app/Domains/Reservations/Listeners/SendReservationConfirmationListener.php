<?php

declare(strict_types=1);

namespace App\Domains\Reservations\Listeners;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Reservations\Events\ReservationCreated;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

class SendReservationConfirmationListener implements ShouldQueue
{
    public bool   $afterCommit = true;
    public string $queue       = 'default';
    public int    $tries       = 3;
    public int    $backoff     = 5;

    public function __construct(private SmsService $sms) {}

    public function handle(ReservationCreated $event): void
    {
        $res = $event->reservation;

        try {
            $date = $res->date->format('d M Y');
            $time = substr($res->time_slot, 0, 5);

            $this->sms->send(new SmsMessage(
                to:            $res->customer_phone,
                message:       "Bake & Grill: Reservation confirmed for {$res->party_size} on {$date} at {$time}. Ref: #{$res->id}. See you soon!",
                type:          'transactional',
                customerId:    $res->customer_id,
                referenceType: 'reservation',
                referenceId:   $res->id,
                idempotencyKey: "reservation:confirm:{$res->id}",
            ));
        } catch (\Throwable $e) {
            Log::error('SendReservationConfirmationListener failed', [
                'reservation_id' => $res->id,
                'error'          => $e->getMessage(),
            ]);
        }
    }
}
