<?php

declare(strict_types=1);

namespace App\Domains\Shifts\Listeners;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertAudience;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\Operations\Services\OpsAlertsService;
use App\Domains\Shifts\Events\ShiftClosed;
use App\Models\Shift;
use App\Support\OwnerPhones;
use Illuminate\Support\Facades\Log;

/**
 * Owner, 2026-11-16: "I need an notification so that i know when the shift is opened and closed". Who closed which
 * till, when, how long it was open, the orders and sales, and the cash counted against what should be there. One
 * close is one message: whoever gets the cash-variance alert for this close is left to that one.
 */
class TellOwnersShiftClosedListener
{
    public const TYPE = 'owner_shift_closed';

    public function __construct(private readonly SmsService $sms, private readonly OpsAlertsService $ops) {}

    public function handle(ShiftClosed $event): void
    {
        $d = $event->data;
        if (!AlertSwitch::isOn(self::TYPE)) {
            return;
        }
        $shift = Shift::query()->with('device:id,name')->find($d->shiftId);
        $till = trim((string) ($shift?->device?->name ?? '')) ?: 'a till';
        $tz = (string) config('app.timezone');
        $closed = ($shift?->closed_at ?? now())->timezone($tz);
        $open = '';
        if ($shift?->opened_at) {
            $minutes = (int) max(0, $shift->opened_at->diffInMinutes($closed, true));
            $open = sprintf(' after %dh %02dm', intdiv($minutes, 60), $minutes % 60);
        }
        $cash = abs($d->variance) < 0.01
            ? 'matches'
            : sprintf('%s MVR %s', $d->variance < 0 ? 'short' : 'over', number_format(abs($d->variance), 2));
        $body = sprintf(
            '%s closed the shift on %s at %s%s. %d %s, sales MVR %s. Cash counted MVR %s, expected MVR %s (%s).',
            $d->userName,
            $till,
            $closed->format('g:i A'),
            $open,
            $d->orderCount,
            $d->orderCount === 1 ? 'order' : 'orders',
            number_format($d->totalRevenue, 2),
            number_format($d->actualCash, 2),
            number_format($d->expectedCash, 2),
            $cash,
        );

        // The variance alert already tells its people about this close.
        $threshold = (float) ($this->ops->settings()['shift_variance_alert_mvr'] ?? 0);
        $varianceSent = $threshold > 0 && abs($d->variance) >= $threshold && AlertSwitch::isOn('owner_shift_variance');
        $told = $varianceSent ? OwnerPhones::for('owner_shift_variance')->map(fn ($a) => AlertAudience::addressKey((string) $a))->all() : [];

        try {
            foreach (ShiftAlertPeople::except(OwnerPhones::for(self::TYPE), $d->userId) as $to) {
                if (in_array(AlertAudience::addressKey($to), $told, true)) {
                    continue;
                }
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
