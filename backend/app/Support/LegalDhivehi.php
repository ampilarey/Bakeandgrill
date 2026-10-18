<?php

declare(strict_types=1);

namespace App\Support;

/**
 * The legal pages in Dhivehi (privacy, terms, refund).
 *
 * Their Dhivehi text (resources/views/legal/dv/) is a draft until someone has read
 * and approved it: only with "Dhivehi legal pages approved" (content key
 * legal_dv_approved, Admin → Website → Legal) does a /dv legal page show it. Until
 * then it shows the English, marked as the text that counts. A body the owner typed
 * in Content (legal_*_body) wins over both.
 */
final class LegalDhivehi
{
    /** This Dhivehi page shows the approved Dhivehi text. */
    public static function show(): bool
    {
        return app()->getLocale() === 'dv' && self::approved();
    }

    /** This Dhivehi page shows the English text, with a note saying so. */
    public static function notice(): bool
    {
        return app()->getLocale() === 'dv' && !self::approved();
    }

    public static function approved(): bool
    {
        return filter_var(content('legal_dv_approved', 'false'), FILTER_VALIDATE_BOOLEAN);
    }
}
