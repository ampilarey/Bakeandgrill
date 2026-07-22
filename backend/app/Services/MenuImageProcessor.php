<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Menu media: public crop + optional high-res master for re-edit / reuse.
 *
 * - Item crop (POS/website cards): 1200×900 JPEG @ 82 (4:3)
 * - Category banner (order-app menu): 1400×600 JPEG @ 82 (7:3 ≈ ZUS-style)
 * - Master (admin re-crop): fit within 3200px, aspect preserved, JPEG @ 90
 */
class MenuImageProcessor
{
    public const WIDTH = 1200;

    public const HEIGHT = 900;

    /** Wide category promo for the order-app menu (matches CSS aspect-ratio 7/3). */
    public const BANNER_WIDTH = 1400;

    public const BANNER_HEIGHT = 600;

    public const JPEG_QUALITY = 82;

    public const MASTER_MAX_EDGE = 3200;

    public const MASTER_JPEG_QUALITY = 90;

    public function thumbWidth(): int
    {
        return (int) config('menu_media.thumb.width', 400);
    }

    public function thumbHeight(): int
    {
        return (int) config('menu_media.thumb.height', 300);
    }

    public function thumbQuality(): int
    {
        return (int) config('menu_media.thumb.jpeg_quality', 80);
    }

    /**
     * @return string Relative storage path (e.g. menu/uuid.jpg)
     */
    public function storeProcessed(UploadedFile $file, string $directory, ?int $width = null, ?int $height = null): string
    {
        return $this->writeBinary(
            $this->processToJpeg($file, $width ?? self::WIDTH, $height ?? self::HEIGHT),
            $directory,
        );
    }

    /**
     * Store a card thumbnail (default 400×300).
     *
     * @return string Relative storage path
     */
    public function storeThumbnail(UploadedFile $file, ?string $directory = null): string
    {
        $dir = $directory ?? (string) config('menu_media.thumb.directory', 'thumbs');

        return $this->writeBinary($this->processThumbnailJpeg($file), $dir);
    }

    /**
     * Store a high-res master (full frame, not forced to 4:3).
     *
     * @return string Relative storage path
     */
    public function storeMaster(UploadedFile $file, string $directory): string
    {
        return $this->writeBinary($this->processMasterJpeg($file), $directory);
    }

    /**
     * Store a raw uploaded file (e.g. video) without GD processing.
     *
     * @return string Relative storage path
     */
    public function storeRaw(UploadedFile $file, string $directory, ?string $extension = null): string
    {
        $ext = $extension ?: strtolower((string) $file->getClientOriginalExtension());
        if ($ext === '') {
            $ext = 'bin';
        }
        $filename = Str::uuid()->toString() . '.' . $ext;
        $relative = trim($directory, '/') . '/' . $filename;
        $absolute = storage_path('app/public/' . $relative);

        $dir = dirname($absolute);
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new RuntimeException('Could not create media storage directory.');
        }

        if (!copy($file->getRealPath(), $absolute)) {
            throw new RuntimeException('Could not save uploaded media file.');
        }

        return $relative;
    }

    public function processToJpeg(UploadedFile $file, int $targetW = self::WIDTH, int $targetH = self::HEIGHT): string
    {
        return $this->cropResampleJpeg($file, $targetW, $targetH, self::JPEG_QUALITY);
    }

    public function processThumbnailJpeg(UploadedFile $file): string
    {
        return $this->cropResampleJpeg(
            $file,
            $this->thumbWidth(),
            $this->thumbHeight(),
            $this->thumbQuality(),
        );
    }

    public function processMasterJpeg(UploadedFile $file): string
    {
        $image = $this->loadUploaded($file);

        try {
            [$srcW, $srcH] = $this->dimensions($image);
            $scale = min(1, self::MASTER_MAX_EDGE / max($srcW, $srcH));
            $targetW = max(1, (int) round($srcW * $scale));
            $targetH = max(1, (int) round($srcH * $scale));

            return $this->resampleToJpeg(
                $image,
                0,
                0,
                $srcW,
                $srcH,
                $targetW,
                $targetH,
                self::MASTER_JPEG_QUALITY,
            );
        } finally {
            imagedestroy($image);
        }
    }

    /**
     * Generate a thumbnail from an existing public-disk relative path (backfill).
     */
    public function storeThumbnailFromStoragePath(string $relativePath, ?string $directory = null): string
    {
        $absolute = storage_path('app/public/' . ltrim($relativePath, '/'));
        if (!is_readable($absolute)) {
            throw new RuntimeException('Source image for thumbnail is not readable.');
        }

        $uploaded = new UploadedFile(
            $absolute,
            basename($absolute),
            mime_content_type($absolute) ?: 'image/jpeg',
            null,
            true,
        );

        return $this->storeThumbnail($uploaded, $directory);
    }

    private function cropResampleJpeg(UploadedFile $file, int $targetW, int $targetH, int $quality): string
    {
        $image = $this->loadUploaded($file);

        try {
            [$srcW, $srcH] = $this->dimensions($image);
            $targetAspect = $targetW / $targetH;
            $srcAspect = $srcW / $srcH;

            if ($srcAspect > $targetAspect) {
                $cropH = $srcH;
                $cropW = (int) round($srcH * $targetAspect);
                $cropX = (int) max(0, round(($srcW - $cropW) / 2));
                $cropY = 0;
            } else {
                $cropW = $srcW;
                $cropH = (int) round($srcW / $targetAspect);
                $cropX = 0;
                $cropY = (int) max(0, round(($srcH - $cropH) / 2));
            }

            return $this->resampleToJpeg(
                $image,
                $cropX,
                $cropY,
                $cropW,
                $cropH,
                $targetW,
                $targetH,
                $quality,
            );
        } finally {
            imagedestroy($image);
        }
    }

    private function writeBinary(string $binary, string $directory): string
    {
        $filename = Str::uuid()->toString() . '.jpg';
        $relative = trim($directory, '/') . '/' . $filename;
        $absolute = storage_path('app/public/' . $relative);

        $dir = dirname($absolute);
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new RuntimeException('Could not create image storage directory.');
        }

        if (file_put_contents($absolute, $binary) === false) {
            throw new RuntimeException('Could not save processed menu image.');
        }

        return $relative;
    }

    private function loadUploaded(UploadedFile $file): \GdImage
    {
        $path = $file->getRealPath();
        if ($path === false || !is_readable($path)) {
            throw new RuntimeException('Uploaded image is not readable.');
        }

        $info = @getimagesize($path);
        if ($info === false || ($info[0] ?? 0) < 1 || ($info[1] ?? 0) < 1) {
            throw new RuntimeException('Unsupported or corrupt image. Use JPEG, PNG, or WebP.');
        }

        $width = (int) $info[0];
        $height = (int) $info[1];
        $maxEdge = (int) config('menu_media.image.max_edge', 5000);
        $maxMp = (float) config('menu_media.image.max_megapixels', 25);
        $pixels = $width * $height;

        if ($width > $maxEdge || $height > $maxEdge) {
            throw new RuntimeException(
                "Image is too large ({$width}×{$height}). Maximum edge is {$maxEdge}px.",
            );
        }

        if ($pixels > (int) round($maxMp * 1_000_000)) {
            throw new RuntimeException(
                "Image has too many pixels ({$width}×{$height}). Maximum is {$maxMp} megapixels.",
            );
        }

        $mime = (string) ($file->getMimeType() ?: ($info['mime'] ?? ''));
        if (str_contains(strtolower($mime), 'webp') || strtolower(pathinfo($path, PATHINFO_EXTENSION)) === 'webp') {
            if (!\App\Support\ImageCapabilities::supportsWebp()) {
                throw new RuntimeException(
                    "WebP isn't supported on this server; upload JPEG or PNG.",
                );
            }
        }

        $image = $this->createImageResource($path, $mime);
        if ($image === null) {
            throw new RuntimeException('Unsupported or corrupt image. Use JPEG, PNG, or WebP.');
        }

        return $image;
    }

    /** @return array{0: int, 1: int} */
    private function dimensions(\GdImage $image): array
    {
        $srcW = imagesx($image);
        $srcH = imagesy($image);
        if ($srcW < 1 || $srcH < 1) {
            throw new RuntimeException('Invalid image dimensions.');
        }

        return [$srcW, $srcH];
    }

    private function resampleToJpeg(
        \GdImage $image,
        int $srcX,
        int $srcY,
        int $srcW,
        int $srcH,
        int $targetW,
        int $targetH,
        int $quality,
    ): string {
        $out = imagecreatetruecolor($targetW, $targetH);
        if ($out === false) {
            throw new RuntimeException('Could not allocate image canvas.');
        }

        $white = imagecolorallocate($out, 255, 255, 255);
        if ($white !== false) {
            imagefilledrectangle($out, 0, 0, $targetW, $targetH, $white);
        }

        imagecopyresampled($out, $image, 0, 0, $srcX, $srcY, $targetW, $targetH, $srcW, $srcH);

        ob_start();
        imagejpeg($out, null, $quality);
        $binary = ob_get_clean();
        imagedestroy($out);

        if ($binary === false || $binary === '') {
            throw new RuntimeException('Failed to encode menu JPEG.');
        }

        return $binary;
    }

    private function createImageResource(string $path, string $mime): ?\GdImage
    {
        $mime = strtolower($mime);

        return match (true) {
            str_contains($mime, 'jpeg') || str_contains($mime, 'jpg') => @imagecreatefromjpeg($path) ?: null,
            str_contains($mime, 'png') => @imagecreatefrompng($path) ?: null,
            str_contains($mime, 'webp') && function_exists('imagecreatefromwebp') => @imagecreatefromwebp($path) ?: null,
            default => $this->createFromExtension($path),
        };
    }

    private function createFromExtension(string $path): ?\GdImage
    {
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));

        return match ($ext) {
            'jpg', 'jpeg' => @imagecreatefromjpeg($path) ?: null,
            'png' => @imagecreatefrompng($path) ?: null,
            'webp' => function_exists('imagecreatefromwebp') ? (@imagecreatefromwebp($path) ?: null) : null,
            default => null,
        };
    }
}
