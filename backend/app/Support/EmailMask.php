<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Show enough of an e-mail address for its owner to recognise it, and not
 * enough for anyone else to learn it: "ahmed@gmail.com" → "a•••@g•••.com".
 * Used where an unauthenticated screen says where a sign-in code went.
 */
final class EmailMask
{
    public static function mask(?string $email): ?string
    {
        $email = trim((string) $email);
        $at = strrpos($email, '@');
        if ($at === false || $at === 0 || $at === strlen($email) - 1) {
            return null;
        }

        $local = substr($email, 0, $at);
        $domain = substr($email, $at + 1);
        $dot = strrpos($domain, '.');
        $suffix = $dot !== false && $dot > 0 ? substr($domain, $dot) : '';

        return mb_substr($local, 0, 1) . '•••@' . mb_substr($domain, 0, 1) . '•••' . $suffix;
    }
}
