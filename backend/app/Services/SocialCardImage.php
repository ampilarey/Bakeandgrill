<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * A 1200x630 share card built from an item photo.
 *
 * Link previews come in two sizes and the crawler picks by pixels, not by
 * intent: WhatsApp / Viber / Facebook only render the big card above about
 * 600x315 and drop to a postage-stamp thumbnail below it. Owner,
 * 2026-09-01: "enhance the photo shared like logo" — a legacy 256x192 menu
 * photo was previewing as a thumbnail next to the 1080x1080 logo card.
 *
 * So every item gets a card at exactly the size crawlers want:
 *  - a photo big enough to fill it is cover-cropped (sharp, edge to edge);
 *  - a small one is centred at a modest upscale over a blurred, darkened
 *    copy of itself, which reads as deliberate rather than blurry.
 *
 * Cards are rendered once and cached on the public disk under a name
 * derived from the source file, so replacing a photo makes a new card and
 * old crawler caches never serve a stale picture. Rendering is best-effort:
 * any failure returns null and the caller falls back to the raw photo.
 */
final class SocialCardImage
{
    public const WIDTH = 1200;

    public const HEIGHT = 630;

    /** Bump to re-render every card after a design change. */
    private const VERSION = 1;

    private const DIRECTORY = 'social-cards';

    private const QUALITY = 82;

    /** Beyond this the source stops looking sharp, so we stop enlarging. */
    private const MAX_UPSCALE = 2.5;

    /** Fraction of the card the foreground photo may occupy. */
    private const INSET = 0.88;

    /**
     * Public URL of the card for this source image, rendering it if needed.
     *
     * @param string $sourceFile absolute path to a local image
     */
    public function url(string $sourceFile): ?string
    {
        if (!is_file($sourceFile) || !function_exists('imagecreatetruecolor')) {
            return null;
        }

        $name = $this->cacheName($sourceFile);
        $relative = self::DIRECTORY . '/' . $name;

        try {
            $disk = Storage::disk('public');
            if (!$disk->exists($relative)) {
                $binary = $this->render($sourceFile);
                if ($binary === null) {
                    return null;
                }
                $disk->put($relative, $binary);
            }

            return url('storage/' . $relative);
        } catch (\Throwable $e) {
            Log::warning('social card render failed', [
                'source' => basename($sourceFile),
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * Name is derived from the file's identity, so a re-uploaded photo gets
     * a new URL instead of a crawler serving the previous card forever.
     */
    private function cacheName(string $sourceFile): string
    {
        $key = sha1(implode('|', [
            $sourceFile,
            (string) @filesize($sourceFile),
            (string) @filemtime($sourceFile),
            (string) self::VERSION,
            self::WIDTH . 'x' . self::HEIGHT,
        ]));

        return 'card-' . $key . '.jpg';
    }

    private function render(string $sourceFile): ?string
    {
        $source = $this->load($sourceFile);
        if ($source === null) {
            return null;
        }

        $srcW = imagesx($source);
        $srcH = imagesy($source);
        if ($srcW < 1 || $srcH < 1) {
            imagedestroy($source);

            return null;
        }

        $canvas = imagecreatetruecolor(self::WIDTH, self::HEIGHT);

        try {
            // A source that can fill the card without being enlarged past
            // the sharpness cap simply becomes the card.
            $coverScale = max(self::WIDTH / $srcW, self::HEIGHT / $srcH);
            if ($coverScale <= self::MAX_UPSCALE) {
                $this->drawCover($canvas, $source, $srcW, $srcH);
            } else {
                $this->drawBlurredBackdrop($canvas, $source, $srcW, $srcH);
                $this->drawContained($canvas, $source, $srcW, $srcH);
            }

            ob_start();
            imagejpeg($canvas, null, self::QUALITY);
            $binary = ob_get_clean();

            return is_string($binary) && $binary !== '' ? $binary : null;
        } finally {
            imagedestroy($canvas);
            imagedestroy($source);
        }
    }

    /** Fill the whole card, cropping the overflow evenly. */
    private function drawCover(\GdImage $canvas, \GdImage $source, int $srcW, int $srcH): void
    {
        $scale = max(self::WIDTH / $srcW, self::HEIGHT / $srcH);
        $cropW = (int) round(self::WIDTH / $scale);
        $cropH = (int) round(self::HEIGHT / $scale);

        imagecopyresampled(
            $canvas,
            $source,
            0,
            0,
            (int) round(($srcW - $cropW) / 2),
            (int) round(($srcH - $cropH) / 2),
            self::WIDTH,
            self::HEIGHT,
            max(1, min($cropW, $srcW)),
            max(1, min($cropH, $srcH)),
        );
    }

    /**
     * Shrink, blur, enlarge — then blur again at full size. GD's gaussian
     * kernel is a weak fixed 3x3, so blurring only the small copy leaves
     * the upscale's square facets visible; the passes afterwards melt them.
     * It runs once per photo and the result is cached.
     */
    private function drawBlurredBackdrop(\GdImage $canvas, \GdImage $source, int $srcW, int $srcH): void
    {
        $tinyW = 100;
        $tinyH = max(1, (int) round($tinyW * self::HEIGHT / self::WIDTH));
        $tiny = imagecreatetruecolor($tinyW, $tinyH);

        try {
            $scale = max($tinyW / $srcW, $tinyH / $srcH);
            $cropW = max(1, min($srcW, (int) round($tinyW / $scale)));
            $cropH = max(1, min($srcH, (int) round($tinyH / $scale)));
            imagecopyresampled(
                $tiny,
                $source,
                0,
                0,
                (int) round(($srcW - $cropW) / 2),
                (int) round(($srcH - $cropH) / 2),
                $tinyW,
                $tinyH,
                $cropW,
                $cropH,
            );
            for ($i = 0; $i < 2; $i++) {
                imagefilter($tiny, IMG_FILTER_GAUSSIAN_BLUR);
            }
            imagecopyresampled($canvas, $tiny, 0, 0, 0, 0, self::WIDTH, self::HEIGHT, $tinyW, $tinyH);
        } finally {
            imagedestroy($tiny);
        }

        for ($i = 0; $i < 6; $i++) {
            imagefilter($canvas, IMG_FILTER_GAUSSIAN_BLUR);
        }

        // Darken so the centred photo stays the subject.
        $shade = imagecolorallocatealpha($canvas, 0, 0, 0, 82);
        if ($shade !== false) {
            imagefilledrectangle($canvas, 0, 0, self::WIDTH, self::HEIGHT, $shade);
        }
    }

    /** Centre the photo at its largest still-sharp size. */
    private function drawContained(\GdImage $canvas, \GdImage $source, int $srcW, int $srcH): void
    {
        $scale = min(
            (self::WIDTH * self::INSET) / $srcW,
            (self::HEIGHT * self::INSET) / $srcH,
            self::MAX_UPSCALE,
        );
        $drawW = max(1, (int) round($srcW * $scale));
        $drawH = max(1, (int) round($srcH * $scale));

        imagecopyresampled(
            $canvas,
            $source,
            (int) round((self::WIDTH - $drawW) / 2),
            (int) round((self::HEIGHT - $drawH) / 2),
            0,
            0,
            $drawW,
            $drawH,
            $srcW,
            $srcH,
        );
    }

    private function load(string $path): ?\GdImage
    {
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));

        $image = match ($ext) {
            'jpg', 'jpeg' => @imagecreatefromjpeg($path) ?: null,
            'png' => @imagecreatefrompng($path) ?: null,
            'gif' => @imagecreatefromgif($path) ?: null,
            'webp' => function_exists('imagecreatefromwebp') ? (@imagecreatefromwebp($path) ?: null) : null,
            default => null,
        };

        return $image instanceof \GdImage ? $image : null;
    }
}
