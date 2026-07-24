<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Http\UploadedFile;

/**
 * Shared Laravel validation rule fragments for menu image uploads.
 */
final class MenuImageValidation
{
    /**
     * @return list<string|\Illuminate\Contracts\Validation\ValidationRule>
     */
    public static function fileRules(bool $required = true): array
    {
        $maxKb = (int) config('menu_media.image.max_kb', 10240);
        $maxEdge = (int) config('menu_media.image.max_edge', 5000);
        $mimes = self::allowedMimes();

        $rules = [
            $required ? 'required' : 'sometimes',
            'file',
            'image',
            'mimes:' . implode(',', $mimes),
            'max:' . $maxKb,
            "dimensions:max_width={$maxEdge},max_height={$maxEdge}",
        ];

        return $rules;
    }

    /** @return list<string> */
    public static function allowedMimes(): array
    {
        $mimes = config('menu_media.image.mimes', ['jpeg', 'jpg', 'png', 'webp']);
        if (!ImageCapabilities::supportsWebp()) {
            $mimes = array_values(array_filter(
                $mimes,
                static fn (string $m): bool => !in_array($m, ['webp'], true),
            ));
        }

        return $mimes;
    }

    /** @return list<string> */
    public static function allowedMimeTypes(): array
    {
        $types = config('menu_media.image.mime_types', ['image/jpeg', 'image/png', 'image/webp']);
        if (!ImageCapabilities::supportsWebp()) {
            $types = array_values(array_filter(
                $types,
                static fn (string $m): bool => $m !== 'image/webp',
            ));
        }

        return $types;
    }

    public static function webpUnsupportedMessage(): string
    {
        return "WebP isn't supported on this server; upload JPEG or PNG.";
    }

    public static function heicRejectedMessage(): string
    {
        return "iPhone HEIC photos aren't supported directly — they're converted automatically in the app; if you're seeing this, refresh and retry.";
    }

    public static function looksLikeHeic(?UploadedFile $file): bool
    {
        if ($file === null) {
            return false;
        }

        $mime = strtolower((string) ($file->getMimeType() ?: ''));
        if (str_contains($mime, 'heic') || str_contains($mime, 'heif')) {
            return true;
        }

        $ext = strtolower((string) $file->getClientOriginalExtension());

        return in_array($ext, ['heic', 'heif'], true);
    }
}
