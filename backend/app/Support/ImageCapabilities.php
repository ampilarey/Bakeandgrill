<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Runtime GD capability probes for upload validation.
 */
final class ImageCapabilities
{
    public static function supportsWebp(): bool
    {
        return function_exists('imagecreatefromwebp') && function_exists('imagewebp');
    }
}
