<?php

declare(strict_types=1);

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Accepts absolute http(s) URLs or same-origin relative /storage/... paths
 * returned by menu image / item photo uploads.
 */
class MediaUrl implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ($value === null || $value === '') {
            return;
        }

        if (!is_string($value)) {
            $fail('The :attribute must be a valid URL or a /storage/ path.');

            return;
        }

        if (str_starts_with($value, '/storage/') && strlen($value) > strlen('/storage/')) {
            return;
        }
        // Brand files shipped with the site (owner, 2026-09-30: the light logo
        // and the no-photo tile live in public/brand). Same-origin, static,
        // never uploaded, so they are as safe as /storage/ and must survive
        // a later save of the Branding form.
        if (preg_match('#^/(brand|images)/[A-Za-z0-9._/-]+\.(png|jpe?g|webp|svg|gif)$#i', $value) === 1) {
            return;
        }

        if (filter_var($value, FILTER_VALIDATE_URL) !== false
            && (str_starts_with($value, 'http://') || str_starts_with($value, 'https://'))) {
            return;
        }

        $fail('The :attribute must be a valid URL or an uploaded /storage/ path.');
    }
}
