<?php

declare(strict_types=1);

namespace App\Domains\Reviews;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

/**
 * Photos on a review (iruali import plan, feature 6): up to three, each
 * re-encoded with GD so EXIF (GPS included) is gone, kept off the public disk
 * at 1600 px with a 480 px thumbnail. They are served through the review's own
 * route, to everyone once the review is approved and to staff before.
 */
class ReviewPhotos
{
    public const DISK = 'local';

    public const MAX = 3;

    private const EDGE = 1600;

    private const THUMB_EDGE = 480;

    /** @return array{path: string, thumb: string} */
    public function store(UploadedFile $file): array
    {
        $raw = file_get_contents($file->getRealPath());
        $src = $raw === false ? false : @imagecreatefromstring($raw);
        if ($src === false) {
            throw ValidationException::withMessages(['photos' => 'That photo could not be read. Try a JPEG or PNG.']);
        }
        $w = imagesx($src);
        $h = imagesy($src);
        if ($w < 1 || $h < 1 || $w > 8000 || $h > 8000) {
            imagedestroy($src);
            throw ValidationException::withMessages(['photos' => 'That photo is too large.']);
        }
        $id = (string) Str::uuid();
        $path = "review-photos/{$id}.jpg";
        $thumb = "review-photos/{$id}-t.jpg";
        Storage::disk(self::DISK)->put($path, $this->jpeg($src, $w, $h, self::EDGE));
        Storage::disk(self::DISK)->put($thumb, $this->jpeg($src, $w, $h, self::THUMB_EDGE));
        imagedestroy($src);

        return ['path' => $path, 'thumb' => $thumb];
    }

    /** @param list<array{path?: string, thumb?: string}>|null $photos */
    public function delete(?array $photos): void
    {
        foreach ($photos ?? [] as $photo) {
            Storage::disk(self::DISK)->delete(array_values(array_filter([$photo['path'] ?? null, $photo['thumb'] ?? null])));
        }
    }

    public function stream(string $path, bool $public): Response
    {
        abort_unless(str_starts_with($path, 'review-photos/') && Storage::disk(self::DISK)->exists($path), 404);

        return Storage::disk(self::DISK)->response($path, null, [
            'Content-Type' => 'image/jpeg',
            'Cache-Control' => $public ? 'public, max-age=86400' : 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function jpeg(\GdImage $src, int $w, int $h, int $edge): string
    {
        $scale = min(1.0, $edge / max($w, $h));
        $nw = max(1, (int) round($w * $scale));
        $nh = max(1, (int) round($h * $scale));
        $dst = imagecreatetruecolor($nw, $nh);
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        ob_start();
        imagejpeg($dst, null, 85);
        imagedestroy($dst);

        return (string) ob_get_clean();
    }
}
