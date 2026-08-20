<?php

declare(strict_types=1);

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Rejects the PINs an attacker guesses first.
 *
 * A 4-digit PIN is only 10,000 combinations. The login limiter allows 20
 * attempts per identity per 10 minutes, so a patient attacker exhausts the
 * whole space in a few days — but they do not need the whole space, because
 * without a rule like this a meaningful share of staff choose 1234, 0000, or
 * the current year. Those are tried in the first minute.
 *
 * Deliberately NOT a length increase: every existing member of staff has a
 * PIN they have memorised, and forcing six digits at the till is a real cost
 * to weigh separately. This only governs PINs being set or changed, so nobody
 * is locked out by it.
 */
class StrongStaffPin implements ValidationRule
{
    /**
     * Guessed first, in roughly this order, by anyone with a keypad.
     *
     * @var list<string>
     */
    private const BANNED = [
        '1234', '0000', '1111', '1212', '7777', '1004', '2000', '4444',
        '2222', '6969', '9999', '3333', '5555', '6666', '1122', '1313',
        '8888', '4321', '2001', '1010', '123456', '654321', '111111',
        '000000', '121212', '112233', '123123', '159753', '147258',
    ];

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $pin = (string) $value;

        if (in_array($pin, self::BANNED, true)) {
            $fail('That PIN is one of the most commonly guessed. Choose another.');

            return;
        }

        // 1111, 55555 — one repeated digit is the second thing anyone tries.
        if (preg_match('/^(\d)\1+$/', $pin) === 1) {
            $fail('A PIN of one repeated digit is too easy to guess.');

            return;
        }

        if (self::isRun($pin)) {
            $fail('A PIN that runs straight up or down is too easy to guess.');

            return;
        }

        // A four-digit year reads as a birthday or an anniversary and is
        // usually written on something the same person carries.
        if (preg_match('/^(19|20)\d{2}$/', $pin) === 1) {
            $fail('A PIN that looks like a year is too easy to guess.');
        }
    }

    /** 1234 / 4321 / 3456 — consecutive in either direction. */
    private static function isRun(string $pin): bool
    {
        $len = strlen($pin);
        if ($len < 3) {
            return false;
        }

        $step = (int) $pin[1] - (int) $pin[0];
        if ($step !== 1 && $step !== -1) {
            return false;
        }

        for ($i = 2; $i < $len; $i++) {
            if ((int) $pin[$i] - (int) $pin[$i - 1] !== $step) {
                return false;
            }
        }

        return true;
    }
}
