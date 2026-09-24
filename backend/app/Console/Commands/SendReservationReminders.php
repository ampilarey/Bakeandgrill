<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\Reservation;
use Illuminate\Console\Command;

/**
 * Ops audit, 2026-09-25: a guest who booked a week ago heard nothing until
 * they arrived. Every morning, tomorrow's pending and confirmed bookings get
 * a reminder; a booking made today for tomorrow is skipped, since it just
 * had its confirmation.
 */
class SendReservationReminders extends Command
{
    protected $signature = 'reservations:send-reminders {--date= : The booking date to remind for (default tomorrow)}';

    protected $description = 'Text tomorrow\'s reservations a reminder';

    public function handle(SmsService $sms): int
    {
        $tz = config('app.timezone', 'Indian/Maldives');
        $date = $this->option('date')
            ? \Carbon\Carbon::parse((string) $this->option('date'), $tz)->toDateString()
            : now($tz)->addDay()->toDateString();

        $due = Reservation::query()
            ->whereDate('date', $date)
            ->whereIn('status', ['pending', 'confirmed'])
            ->where('created_at', '<', now($tz)->startOfDay())
            ->orderBy('time_slot')
            ->get();

        $sent = 0;
        foreach ($due as $res) {
            $time = substr((string) $res->time_slot, 0, 5);
            $line = "Reminder: your Bake & Grill table for {$res->party_size} is tomorrow ({$res->date->format('D d M')}) at {$time}. Ref #{$res->id}. Reply by calling us if your plans change.";
            $log = $sms->send(new SmsMessage(
                to: $res->customer_phone,
                message: $line,
                type: 'reservation_reminder',
                customerId: $res->customer_id,
                referenceType: 'reservation',
                referenceId: (string) $res->id,
                idempotencyKey: "reservation:reminder:{$res->id}",
            ));
            if (in_array($log->status, ['sent', 'demo', 'queued', 'deferred'], true)) {
                $sent++;
            }
        }
        $this->info("Reminded {$sent} of {$due->count()} booking(s) for {$date}.");

        return self::SUCCESS;
    }
}
