<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Support\OwnerPhones;
use Illuminate\Support\Facades\Log;

/**
 * A label roll running low (round 13, 2026-10-13): when a print counts a
 * roll down to its warning level, the owners hear once, by the channels of
 * the row "Owner: label roll running low" on Admin → System → Notifications
 * (LabelRolls::consume() sends it and remembers that it did).
 */
final class RollStockAlert
{
    public const TYPE = 'owner_labels_roll_low';

    /**
     * @param array<string, mixed> $roll a normalised roll, after the count
     * @return bool whether anyone was told
     */
    public static function send(array $roll): bool
    {
        if (!AlertSwitch::isOn(self::TYPE)) {
            return false;
        }
        $phones = OwnerPhones::for(self::TYPE);
        if ($phones->isEmpty()) {
            return false;
        }
        $message = self::message($roll);
        $sms = app(SmsService::class);
        $sent = 0;
        foreach ($phones as $phone) {
            try {
                $sms->send(new SmsMessage(
                    to: $phone,
                    message: $message,
                    type: self::TYPE,
                    referenceType: 'label_roll_low',
                    referenceId: (string) $roll['id'],
                    // Each drop to the level is its own event (a roll counted up and down again warns again).
                    idempotencyKey: 'label-roll-low:' . $roll['id'] . ':' . $roll['left'] . ':' . now()->format('YmdHis') . ':' . $phone,
                ));
                $sent++;
            } catch (\Throwable $e) {
                Log::error('Failed to send label roll low alert', ['roll' => $roll['id'], 'phone' => $phone, 'error' => $e->getMessage()]);
            }
        }

        return $sent > 0;
    }

    /** "Bake & Grill: the label roll Small roll (60 × 40 mm, label printer) is down to 34 labels (warning at 50). …" */
    public static function message(array $roll): string
    {
        $req = LabelRolls::request($roll);
        $size = StickerLayouts::describe($req['layout'], $req['w'], $req['h']);
        $name = trim((string) ($roll['name'] ?? ''));
        $unit = LabelRolls::unit($roll);
        $left = (int) ($roll['left'] ?? 0);
        $low = (int) ($roll['low'] ?? 0);

        return 'Bake & Grill: the label roll ' . ($name !== '' ? $name . ' (' . $size . ')' : $size)
            . ' is down to ' . $left . ' ' . ($left === 1 ? rtrim($unit, 's') : $unit)
            . ($low > 0 ? ' (warning at ' . $low . ')' : '')
            . '. Order more, and count the new ones in under Labels → Settings → My label rolls.';
    }
}
