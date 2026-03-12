<?php

declare(strict_types=1);

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class MaldivesPhone implements ValidationRule
{
    /**
     * Accepted formats:
     *   +9607XXXXXX  — 11 chars with + prefix, local mobile
     *   9607XXXXXX   — 10 digits with country code, no +
     *   7XXXXXX      — 7 digits, local number starting with 3, 6, 7, or 9
     *
     * Rejects everything else. Never auto-corrects.
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        // Strip spaces, dashes, and parentheses only
        $clean = preg_replace('/[\s\-().]/', '', (string) $value);

        if (!$this->isValid($clean)) {
            $fail('Please enter a valid Maldivian phone number (e.g. 7654321 or +9607654321).');
        }
    }

    public static function normalize(string $phone): string
    {
        $clean = preg_replace('/[\s\-().]/', '', $phone);

        // Already in +960XXXXXXX format
        if (preg_match('/^\+960([0-9]{7})$/', $clean, $m)) {
            return '+960' . $m[1];
        }

        // 960XXXXXXX — 10 digits, no +
        if (preg_match('/^960([0-9]{7})$/', $clean, $m)) {
            return '+960' . $m[1];
        }

        // 7 local digits starting with 3, 6, 7, or 9
        if (preg_match('/^([3679][0-9]{6})$/', $clean, $m)) {
            return '+960' . $m[1];
        }

        // Anything else is invalid — caller must validate first
        throw new \InvalidArgumentException('Invalid Maldivian phone number: ' . $phone);
    }

    private function isValid(string $clean): bool
    {
        return preg_match('/^\+960[0-9]{7}$/', $clean)
            || preg_match('/^960[0-9]{7}$/', $clean)
            || preg_match('/^[3679][0-9]{6}$/', $clean);
    }
}
