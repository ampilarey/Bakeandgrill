<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class ImageThumbController extends Controller
{
    /** Max width/height for thumbnails (faster load for cards/lists) */
    private const THUMB_SIZE = 400;

    /** Allowed path prefix for security (no directory traversal) */
    private const ALLOWED_PREFIX = 'images/cafe/';

    /**
     * Serve a resized thumbnail for local cafe images. Generates and caches on first request.
     */
    public function show(Request $request, string $path): Response|BinaryFileResponse
    {
        // Get full path from request so slashes are preserved (e.g. images/cafe/Kavaabu.png)
        $path = trim(Str::after($request->path(), 'thumb/'), '/') ?: trim($path, '/');
        if (!str_starts_with($path, self::ALLOWED_PREFIX)) {
            abort(404);
        }
        $originalPath = public_path($path);
        if (!is_file($originalPath) || !is_readable($originalPath)) {
            abort(404);
        }

        $cacheRelative = 'thumbs/' . $path;
        $cachePath = storage_path('app/public/' . $cacheRelative);

        if (is_file($cachePath) && is_readable($cachePath)) {
            return $this->serveFile($cachePath, $path);
        }

        $resized = $this->resizeImage($originalPath, $path);
        if ($resized === null) {
            return $this->serveFile($originalPath, $path);
        }

        $dir = dirname($cachePath);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        if (file_put_contents($cachePath, $resized) !== false) {
            return $this->serveBinary($resized, $path);
        }

        return $this->serveBinary($resized, $path);
    }

    private function serveFile(string $filePath, string $originalPath): BinaryFileResponse
    {
        $mime = $this->mimeForPath($originalPath);

        return response()->file($filePath, [
            'Content-Type' => $mime,
            'Cache-Control' => 'public, max-age=31536000',
        ]);
    }

    private function serveBinary(string $binary, string $originalPath): Response
    {
        $mime = $this->mimeForPath($originalPath);

        return response($binary, 200, [
            'Content-Type' => $mime,
            'Cache-Control' => 'public, max-age=31536000',
        ]);
    }

    private function mimeForPath(string $path): string
    {
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));

        return match ($ext) {
            'png' => 'image/png',
            'jpg', 'jpeg' => 'image/jpeg',
            'webp' => 'image/webp',
            'gif' => 'image/gif',
            default => 'application/octet-stream',
        };
    }

    /**
     * Resize image to fit within THUMB_SIZE, preserve aspect ratio. Returns binary content or null on failure.
     */
    private function resizeImage(string $originalPath, string $pathForMime): ?string
    {
        $ext = strtolower(pathinfo($originalPath, PATHINFO_EXTENSION));
        $image = match ($ext) {
            'png' => @imagecreatefrompng($originalPath),
            'jpg', 'jpeg' => @imagecreatefromjpeg($originalPath),
            'gif' => @imagecreatefromgif($originalPath),
            'webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($originalPath) : null,
            default => null,
        };
        if ($image === false || $image === null) {
            return null;
        }

        $w = imagesx($image);
        $h = imagesy($image);
        if ($w <= 0 || $h <= 0) {
            imagedestroy($image);

            return null;
        }
        $max = self::THUMB_SIZE;
        if ($w <= $max && $h <= $max) {
            ob_start();
            match ($ext) {
                'png' => imagepng($image, null, 6),
                'jpg', 'jpeg' => imagejpeg($image, null, 82),
                'gif' => imagegif($image),
                'webp' => function_exists('imagewebp') ? imagewebp($image) : imagepng($image, null, 6),
                default => imagepng($image, null, 6),
            };
            $out = ob_get_clean();
            imagedestroy($image);

            return $out ?: null;
        }

        $ratio = min($max / $w, $max / $h, 1.0);
        $nw = (int) round($w * $ratio);
        $nh = (int) round($h * $ratio);
        if ($nw < 1) {
            $nw = 1;
        }
        if ($nh < 1) {
            $nh = 1;
        }

        $thumb = imagecreatetruecolor($nw, $nh);
        if ($thumb === false) {
            imagedestroy($image);

            return null;
        }
        if ($ext === 'png' || $ext === 'gif') {
            imagealphablending($thumb, false);
            imagesavealpha($thumb, true);
            $transparent = imagecolorallocatealpha($thumb, 255, 255, 255, 127);
            imagefilledrectangle($thumb, 0, 0, $nw, $nh, $transparent);
        }
        imagecopyresampled($thumb, $image, 0, 0, 0, 0, $nw, $nh, $w, $h);
        imagedestroy($image);

        ob_start();
        match ($ext) {
            'png' => imagepng($thumb, null, 6),
            'jpg', 'jpeg' => imagejpeg($thumb, null, 82),
            'gif' => imagegif($thumb),
            'webp' => function_exists('imagewebp') ? imagewebp($thumb) : imagepng($thumb, null, 6),
            default => imagepng($thumb, null, 6),
        };
        $out = ob_get_clean();
        imagedestroy($thumb);

        return $out ?: null;
    }
}
