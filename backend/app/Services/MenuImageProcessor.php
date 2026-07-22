<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Menu media: public crop + optional high-res master for re-edit / reuse.
 *
 * - Crop (POS/website): 1200×900 JPEG @ 82
 * - Master (admin re-crop): fit within 3200px, aspect preserved, JPEG @ 90
 */
class MenuImageProcessor
{
    public const WIDTH = 1200;

    public const HEIGHT = 900;

    public const JPEG_QUALITY = 82;

    public const MASTER_MAX_EDGE = 3200;

    public const MASTER_JPEG_QUALITY = 90;

    /**
     * @return string Relative storage path (e.g. menu/uuid.jpg)
     */
    public function storeProcessed(UploadedFile $file, string $directory): string
    {
        return $this->writeBinary($this->processToJpeg($file), $directory);
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

    public function processToJpeg(UploadedFile $file): string
    {
        $image = $this->loadUploaded($file);

        try {
            [$srcW, $srcH] = $this->dimensions($image);
            $targetW = self::WIDTH;
            $targetH = self::HEIGHT;
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
                self::JPEG_QUALITY,
            );
        } finally {
            imagedestroy($image);
        }
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
