<?php

declare(strict_types=1);

namespace App\Domains\Complaints\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Private complaint photos — not the staff media library.
 * Re-encode with GD so EXIF (including GPS) is stripped.
 */
class ComplaintPhotoService
{
    public const DISK = 'local';

    public const MAX_BYTES = 5_000_000;

    public const MAX_EDGE = 2400;

    public function store(UploadedFile $file, string $tokenHash, string $ip): array
    {
        if (RateLimiter::tooManyAttempts('complaint-photo-ip:'.$ip, 30)) {
            throw ValidationException::withMessages(['photo' => 'Too many photo uploads. Try again later.']);
        }
        if (RateLimiter::tooManyAttempts('complaint-photo-token:'.$tokenHash, 10)) {
            throw ValidationException::withMessages(['photo' => 'Too many photo uploads for this document.']);
        }

        if (! str_starts_with((string) $file->getMimeType(), 'image/')) {
            throw ValidationException::withMessages(['photo' => 'Images only.']);
        }
        if ($file->getSize() > self::MAX_BYTES) {
            throw ValidationException::withMessages(['photo' => 'Photo is too large (max 5 MB).']);
        }

        $binary = $this->reencodeStripped($file);
        $id = (string) Str::uuid();
        $path = 'complaint-photos/'.$id.'.jpg';

        Storage::disk(self::DISK)->put($path, $binary);

        RateLimiter::hit('complaint-photo-ip:'.$ip, 3600);
        RateLimiter::hit('complaint-photo-token:'.$tokenHash, 3600);

        return [
            'upload_id' => $id,
            'disk' => self::DISK,
            'path' => $path,
        ];
    }

    public function pathForUploadId(string $uploadId): ?string
    {
        if (! preg_match('/^[0-9a-f-]{36}$/i', $uploadId)) {
            return null;
        }
        $path = 'complaint-photos/'.$uploadId.'.jpg';

        return Storage::disk(self::DISK)->exists($path) ? $path : null;
    }

    public function streamForStaff(string $path)
    {
        abort_unless(Storage::disk(self::DISK)->exists($path), 404);

        return Storage::disk(self::DISK)->response($path, null, [
            'Content-Type' => 'image/jpeg',
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function reencodeStripped(UploadedFile $file): string
    {
        $raw = file_get_contents($file->getRealPath());
        if ($raw === false) {
            throw ValidationException::withMessages(['photo' => 'Could not read photo.']);
        }

        $src = @imagecreatefromstring($raw);
        if ($src === false) {
            throw ValidationException::withMessages(['photo' => 'Unsupported or corrupt image.']);
        }

        $w = imagesx($src);
        $h = imagesy($src);
        if ($w < 1 || $h < 1 || $w > 8000 || $h > 8000) {
            imagedestroy($src);
            throw ValidationException::withMessages(['photo' => 'Image dimensions are not allowed.']);
        }

        $scale = min(1.0, self::MAX_EDGE / max($w, $h));
        $nw = max(1, (int) round($w * $scale));
        $nh = max(1, (int) round($h * $scale));
        $dst = imagecreatetruecolor($nw, $nh);
        if ($dst === false) {
            imagedestroy($src);
            throw ValidationException::withMessages(['photo' => 'Could not process photo.']);
        }
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        imagedestroy($src);

        ob_start();
        imagejpeg($dst, null, 85);
        imagedestroy($dst);
        $out = ob_get_clean();
        if (! is_string($out) || $out === '') {
            throw ValidationException::withMessages(['photo' => 'Could not encode photo.']);
        }

        return $out;
    }
}
