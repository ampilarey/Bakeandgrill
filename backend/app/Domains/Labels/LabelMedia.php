<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\Media;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Pictures that must stay exactly as uploaded. The media library's upload
 * path re-encodes pictures as JPEG on white; a brand logo, hand lettering or
 * a cut-out is a transparent PNG, and re-encoded it prints in a white box.
 * Stored as the bytes given, deduplicated by checksum.
 */
final class LabelMedia
{
    public const MAX_BYTES = 4 * 1024 * 1024;

    /** @throws \InvalidArgumentException when the bytes are not a PNG, WebP or SVG picture. */
    public static function storePng(string $bytes, string $title, string $source = 'labels'): Media
    {
        if (strlen($bytes) > self::MAX_BYTES) {
            throw new \InvalidArgumentException('The picture is over 4 MB. Save it smaller and try again.');
        }
        $mime = self::mime($bytes);
        if ($mime === null) {
            throw new \InvalidArgumentException('Upload a PNG with a clear background (WebP works too).');
        }
        $checksum = hash('sha256', $bytes);
        if ($existing = Media::query()->where('checksum', $checksum)->first()) {
            return $existing;
        }
        $ext = ['image/png' => 'png', 'image/webp' => 'webp'][$mime];
        $relative = 'library/labels/' . Str::uuid() . '.' . $ext;
        Storage::disk('public')->put($relative, $bytes);
        [$w, $h] = @getimagesizefromstring($bytes) ?: [null, null];

        return Media::query()->create([
            'disk' => 'public',
            'path' => $relative,
            'media_type' => 'image',
            'mime_type' => $mime,
            'file_size' => strlen($bytes),
            'width' => $w,
            'height' => $h,
            'title' => $title,
            'source' => $source,
            'checksum' => $checksum,
        ]);
    }

    private static function mime(string $bytes): ?string
    {
        if (str_starts_with($bytes, "\x89PNG\r\n\x1a\n")) {
            return 'image/png';
        }
        if (str_starts_with($bytes, 'RIFF') && substr($bytes, 8, 4) === 'WEBP') {
            return 'image/webp';
        }

        return null;
    }
}
