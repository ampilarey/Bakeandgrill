<?php

declare(strict_types=1);

namespace App\Domains\Shifts\Listeners;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Operations\Services\OpsAlertsService;
use App\Domains\Shifts\Events\ShiftClosed;
use App\Support\OwnerPhones;
use Illuminate\Support\Facades\Log;

/**
 * Ops audit, 2026-09-25: a close that landed short or over by more than the
 * owner's threshold texts the owners as it happens, not when the variance
 * report is next opened.
 */
class AlertOwnerOnShiftVarianceListener
{
    public function __construct(private readonly SmsService $sms, private readonly OpsAlertsService $ops) {}

    public function handle(ShiftClosed $event): void
    {
        $d = $event->data;
        $threshold = (float) ($this->ops->settings()['shift_variance_alert_mvr'] ?? 0);
        if ($threshold <= 0 || abs($d->variance) < $threshold) {
            return;
        }

        $direction = $d->variance < 0 ? 'SHORT' : 'OVER';
        $body = sprintf(
            'Shift #%d closed by %s is %s by MVR %s (expected MVR %s, counted MVR %s). See Shifts.',
            $d->shiftId,
            $d->userName,
            $direction,
            number_format(abs($d->variance), 2),
            number_format($d->expectedCash, 2),
            number_format($d->actualCash, 2),
        );

        try {
            foreach (OwnerPhones::for('owner_shift_variance') as $phone) {
                $this->sms->send(new SmsMessage(
                    to: $phone,
                    message: $body,
                    type: 'owner_shift_variance',
                    referenceType: 'shift',
                    referenceId: (string) $d->shiftId,
                    idempotencyKey: 'shift-variance:' . $d->shiftId . ':' . $phone,
                ));
            }
        } catch (\Throwable $e) {
            Log::warning('shift.variance_alert_failed', ['shift_id' => $d->shiftId, 'error' => $e->getMessage()]);
        }
    }
}
