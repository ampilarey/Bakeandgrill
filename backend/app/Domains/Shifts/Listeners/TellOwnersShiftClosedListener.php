<?php

declare(strict_types=1);

namespace App\Domains\Shifts\Listeners;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertAudience;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\Shifts\Events\ShiftClosed;
use App\Models\Shift;
use App\Support\OwnerPhones;
use Illuminate\Support\Facades\Log;

/**
 * Owner, 2026-11-16: "I need an notification so that i know when the shift is opened and closed". Who closed which
 * till, when, how long it was open, the orders and sales, and the cash counted against what should be there. It
 * replaced the cash-variance alert (retired 2026-11-16), so the cash check is in it, matching or not.
 */
class TellOwnersShiftClosedListener
{
    public const TYPE = 'owner_shift_closed';

    public function __construct(private readonly SmsService $sms) {}

    public function handle(ShiftClosed $event): void
    {
        $d = $event->data;
        if (!AlertSwitch::isOn(self::TYPE)) {
            return;
        }
        // Owner, 2026-11-16: short lines, plain letters only so it stays one SMS, no till name.
        $shift = Shift::query()->find($d->shiftId);
        $closed = ($shift?->closed_at ?? now())->timezone((string) config('app.timezone'));
        $when = $closed->format('g:i A');
        if ($shift?->opened_at) {
            $minutes = (int) max(0, $shift->opened_at->diffInMinutes($closed, true));
            $when .= sprintf(', open %dh %02dm', intdiv($minutes, 60), $minutes % 60);
        }
        $cash = abs($d->variance) < 0.01
            ? 'Cash MATCHES'
            : sprintf('Cash %s MVR %s', $d->variance < 0 ? 'SHORT' : 'OVER', number_format(abs($d->variance), 2));
        $lines = [
            sprintf('Shift #%d closed - %s', $d->shiftId, $d->userName),
            $when,
            $cash,
            'Expected ' . number_format($d->expectedCash, 2),
            'Counted ' . number_format($d->actualCash, 2),
        ];
        if ($shift !== null) {
            $lines[] = 'Start cash ' . number_format((float) $shift->opening_cash, 2);
        }
        $lines[] = sprintf('%d %s, MVR %s', $d->orderCount, $d->orderCount === 1 ? 'order' : 'orders', number_format($d->totalRevenue, 2));
        $body = implode("\n", $lines);

        try {
            foreach (ShiftAlertPeople::except(OwnerPhones::for(self::TYPE), $d->userId) as $to) {
                $this->sms->send(new SmsMessage(
                    to: $to,
                    message: $body,
                    type: self::TYPE,
                    referenceType: 'shift',
                    referenceId: (string) $d->shiftId,
                    idempotencyKey: 'shift-closed:' . $d->shiftId . ':' . AlertAudience::addressKey($to),
                ));
            }
        } catch (\Throwable $e) {
            Log::warning('shift.closed_alert_failed', ['shift_id' => $d->shiftId, 'error' => $e->getMessage()]);
        }
    }
}
