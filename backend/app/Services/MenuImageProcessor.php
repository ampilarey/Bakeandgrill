<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Normalize menu / gallery uploads to a fixed 4:3 JPEG for POS + website.
 *
 * Target: 1200×900 (~2× common card widths) at quality 82 — sharp on retina,
 * typically 120–250 KB so menu grids stay fast.
 */
class MenuImageProcessor
{
    public const WIDTH = 1200;

    public const HEIGHT = 900;

    public const JPEG_QUALITY = 82;

    /**
     * Process an uploaded image and store it on the public disk.
     *
     * @return string Relative storage path (e.g. menu/uuid.jpg)
     */
    public function storeProcessed(UploadedFile $file, string $directory): string
    {
        $binary = $this->processToJpeg($file);
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

    public function processToJpeg(UploadedFile $file): string
    {
        $path = $file->getRealPath();
        if ($path === false || !is_readable($path)) {
            throw new RuntimeException('Uploaded image is not readable.');
        }

        $image = $this->createImageResource($path, (string) $file->getMimeType());
        if ($image === null) {
            throw new RuntimeException('Unsupported or corrupt image. Use JPEG, PNG, or WebP.');
        }

        try {
            $srcW = imagesx($image);
            $srcH = imagesy($image);
            if ($srcW < 1 || $srcH < 1) {
                throw new RuntimeException('Invalid image dimensions.');
            }

            $targetW = self::WIDTH;
            $targetH = self::HEIGHT;
            $targetAspect = $targetW / $targetH;
            $srcAspect = $srcW / $srcH;

            // Cover-crop into 4:3, then scale to exact target size.
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

            $out = imagecreatetruecolor($targetW, $targetH);
            if ($out === false) {
                throw new RuntimeException('Could not allocate image canvas.');
            }

            // Flatten transparency onto white (menu thumbs are always JPEG).
            $white = imagecolorallocate($out, 255, 255, 255);
            if ($white !== false) {
                imagefilledrectangle($out, 0, 0, $targetW, $targetH, $white);
            }

            imagecopyresampled(
                $out,
                $image,
                0,
                0,
                $cropX,
                $cropY,
                $targetW,
                $targetH,
                $cropW,
                $cropH,
            );

            ob_start();
            imagejpeg($out, null, self::JPEG_QUALITY);
            $binary = ob_get_clean();
            imagedestroy($out);

            if ($binary === false || $binary === '') {
                throw new RuntimeException('Failed to encode menu JPEG.');
            }

            return $binary;
        } finally {
            imagedestroy($image);
        }
    }

    private function createImageResource(string $path, string $mime): \GdImage|null
    {
        $mime = strtolower($mime);

        return match (true) {
            str_contains($mime, 'jpeg') || str_contains($mime, 'jpg') => @imagecreatefromjpeg($path) ?: null,
            str_contains($mime, 'png') => @imagecreatefrompng($path) ?: null,
            str_contains($mime, 'webp') && function_exists('imagecreatefromwebp') => @imagecreatefromwebp($path) ?: null,
            default => $this->createFromExtension($path),
        };
    }

    private function createFromExtension(string $path): \GdImage|null
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
