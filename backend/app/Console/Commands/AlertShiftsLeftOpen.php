<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Operations\Services\OpsAlertsService;
use App\Models\Shift;
use App\Support\OwnerPhones;
use Illuminate\Console\Command;

/**
 * Ops audit, 2026-09-25: a shift left open overnight was invisible until
 * somebody noticed the till still counted against yesterday. Hourly: any
 * shift open longer than the owner's threshold texts the owners, once a day
 * per shift.
 */
class AlertShiftsLeftOpen extends Command
{
    protected $signature = 'shifts:alert-open';

    protected $description = 'Text the owners about shifts open longer than the configured number of hours';

    public function handle(SmsService $sms, OpsAlertsService $ops): int
    {
        $hours = (int) ($ops->settings()['shift_open_alert_hours'] ?? 0);
        if ($hours <= 0) {
            $this->info('Shift left-open alert is off.');

            return self::SUCCESS;
        }

        $stale = Shift::query()
            ->whereNull('closed_at')
            ->where('opened_at', '<=', now()->subHours($hours))
            ->with(['user:id,name', 'device:id,name'])
            ->orderBy('opened_at')
            ->get();

        if ($stale->isEmpty()) {
            $this->info('No shifts open longer than ' . $hours . ' hours.');

            return self::SUCCESS;
        }

        $bits = $stale->map(fn (Shift $s) => sprintf(
            '#%d %s on %s since %s (%dh)',
            $s->id,
            $s->user?->name ?? 'unknown',
            $s->device?->name ?? 'till',
            $s->opened_at?->timezone(config('app.timezone', 'Indian/Maldives'))->format('D H:i') ?? '?',
            (int) $s->opened_at?->diffInHours(now()),
        ))->all();
        $body = 'Shift left open: ' . implode('; ', $bits) . '. Close it from the till or force-close it in Shifts.';
        $day = now()->toDateString();

        foreach (OwnerPhones::for('owner_shift_left_open') as $phone) {
            $sms->send(new SmsMessage(
                to: $phone,
                message: $body,
                type: 'owner_shift_left_open',
                referenceType: 'shift_left_open',
                referenceId: $day,
                idempotencyKey: 'shift-left-open:' . $day . ':' . $stale->pluck('id')->implode(',') . ':' . $phone,
            ));
        }
        $this->info('Alerted owners about ' . $stale->count() . ' open shift(s).');

        return self::SUCCESS;
    }
}
