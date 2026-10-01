<?php

declare(strict_types=1);

namespace App\Services;

use App\Support\ImageCapabilities;
use App\Support\MenuImageValidation;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * A cut-out thumbnail: the dish with its background removed, kept
 * see-through so the card can draw its own circle behind it.
 *
 * MenuImageProcessor flattens every upload onto white and writes JPEG, which
 * is right for a photo and exactly wrong here: the first thing a cut-out
 * would lose is the cut. This one resizes with the alpha channel intact and
 * writes PNG, with a WebP beside it where the server can (WebP carries
 * alpha too, at a third of the size).
 */
final class CutoutImageProcessor
{
    /** Cards draw it at 132 px on a phone; 800 is plenty for a 3x screen. */
    public const MAX_EDGE = 800;

    public const PNG_COMPRESSION = 6;

    public const WEBP_QUALITY = 85;

    public const DIRECTORY = 'menu-cutouts';

    /**
     * @return array{path: string, webp_path: ?string, width: int, height: int}
     */
    public function store(UploadedFile $file, string $directory = self::DIRECTORY): array
    {
        $image = $this->load($file);

        if (!$this->hasTransparency($image)) {
            imagedestroy($image);
            throw new RuntimeException('That file has no see-through background. Save it as a PNG with the background removed, then upload again.');
        }

        $resized = $this->fit($image, self::MAX_EDGE);
        if ($resized !== $image) {
            imagedestroy($image);
        }

        ob_start();
        imagepng($resized, null, self::PNG_COMPRESSION);
        $png = (string) ob_get_clean();

        $webp = null;
        if (ImageCapabilities::supportsWebp() && function_exists('imagewebp')) {
            ob_start();
            $ok = @imagewebp($resized, null, self::WEBP_QUALITY);
            $buffer = (string) ob_get_clean();
            $webp = $ok && $buffer !== '' ? $buffer : null;
        }

        $width = imagesx($resized);
        $height = imagesy($resized);
        imagedestroy($resized);

        $path = $this->write($png, $directory, 'png');
        $webpPath = $webp !== null ? $this->write($webp, $directory, 'webp') : null;

        return ['path' => $path, 'webp_path' => $webpPath, 'width' => $width, 'height' => $height];
    }

    /** Remove the files a cut-out URL pair points at, when they are ours. */
    public function forget(?string ...$urls): void
    {
        foreach ($urls as $url) {
            $url = (string) $url;
            if (!str_starts_with($url, '/storage/' . self::DIRECTORY . '/')) {
                continue;
            }
            Storage::disk('public')->delete(substr($url, strlen('/storage/')));
        }
    }

    private function load(UploadedFile $file): \GdImage
    {
        if (MenuImageValidation::looksLikeHeic($file)) {
            throw new RuntimeException(MenuImageValidation::heicRejectedMessage());
        }
        $path = $file->getRealPath();
        if ($path === false || !is_readable($path)) {
            throw new RuntimeException('Uploaded image is not readable.');
        }
        $info = @getimagesize($path);
        if ($info === false) {
            throw new RuntimeException('Unsupported or corrupt image. Use a PNG with the background removed.');
        }
        $mime = strtolower((string) ($info['mime'] ?? ''));
        $image = match (true) {
            str_contains($mime, 'png') => @imagecreatefrompng($path) ?: null,
            str_contains($mime, 'webp') && function_exists('imagecreatefromwebp') => @imagecreatefromwebp($path) ?: null,
            str_contains($mime, 'gif') => @imagecreatefromgif($path) ?: null,
            default => null,
        };
        if ($image === null) {
            throw new RuntimeException('A cut-out must be a PNG or WebP with a see-through background.');
        }
        imagepalettetotruecolor($image);
        imagealphablending($image, false);
        imagesavealpha($image, true);

        return $image;
    }

    /**
     * Sample a grid of pixels for anything not fully opaque. A flattened
     * photo saved as PNG has none, and would sit in the circle as a square.
     */
    private function hasTransparency(\GdImage $image): bool
    {
        $w = imagesx($image);
        $h = imagesy($image);
        $stepX = max(1, intdiv($w, 48));
        $stepY = max(1, intdiv($h, 48));
        for ($y = 0; $y < $h; $y += $stepY) {
            for ($x = 0; $x < $w; $x += $stepX) {
                if (((imagecolorat($image, $x, $y) >> 24) & 0x7F) > 0) {
                    return true;
                }
            }
        }

        return false;
    }

    private function fit(\GdImage $image, int $maxEdge): \GdImage
    {
        $w = imagesx($image);
        $h = imagesy($image);
        $scale = min(1.0, $maxEdge / max($w, $h));
        if ($scale >= 1.0) {
            return $image;
        }
        $tw = max(1, (int) round($w * $scale));
        $th = max(1, (int) round($h * $scale));
        $out = imagecreatetruecolor($tw, $th);
        imagealphablending($out, false);
        imagesavealpha($out, true);
        $clear = imagecolorallocatealpha($out, 0, 0, 0, 127);
        imagefill($out, 0, 0, $clear);
        imagecopyresampled($out, $image, 0, 0, 0, 0, $tw, $th, $w, $h);

        return $out;
    }

    private function write(string $binary, string $directory, string $extension): string
    {
        $relative = trim($directory, '/') . '/' . Str::uuid()->toString() . '.' . $extension;
        if (!Storage::disk('public')->put($relative, $binary)) {
            throw new RuntimeException('Could not save the cut-out.');
        }

        return $relative;
    }
}
