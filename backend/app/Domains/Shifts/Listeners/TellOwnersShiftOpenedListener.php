<?php

declare(strict_types=1);

namespace App\Domains\Shifts\Listeners;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertAudience;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\Shifts\Events\ShiftOpened;
use App\Models\Shift;
use App\Support\OwnerPhones;
use Illuminate\Support\Facades\Log;

/**
 * Owner, 2026-11-16: "I need an notification so that i know when the shift is opened and closed". Who opened which
 * till, when and with how much in the drawer, by SMS, email and Telegram as the row and each person's channels say.
 */
class TellOwnersShiftOpenedListener
{
    public const TYPE = 'owner_shift_opened';

    public function __construct(private readonly SmsService $sms) {}

    public function handle(ShiftOpened $event): void
    {
        $d = $event->data;
        if (!AlertSwitch::isOn(self::TYPE)) {
            return;
        }
        $shift = Shift::query()->with('device:id,name')->find($d->shiftId);
        $till = trim((string) ($shift?->device?->name ?? '')) ?: 'a till';
        $at = ($shift?->opened_at ?? now())->timezone(config('app.timezone'))->format('g:i A');
        $body = sprintf('%s opened a shift on %s at %s with MVR %s in the drawer.', $d->userName, $till, $at, number_format($d->openingCash, 2));

        try {
            foreach (ShiftAlertPeople::except(OwnerPhones::for(self::TYPE), $d->userId) as $to) {
                $this->sms->send(new SmsMessage(
                    to: $to,
                    message: $body,
                    type: self::TYPE,
                    referenceType: 'shift',
                    referenceId: (string) $d->shiftId,
                    idempotencyKey: 'shift-opened:' . $d->shiftId . ':' . AlertAudience::addressKey($to),
                ));
            }
        } catch (\Throwable $e) {
            Log::warning('shift.opened_alert_failed', ['shift_id' => $d->shiftId, 'error' => $e->getMessage()]);
        }
    }
}
