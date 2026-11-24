<?php

declare(strict_types=1);

namespace App\Domains\Ai;

use App\Models\Item;
use App\Services\MenuImageProcessor;
use App\Support\MediaFileCleaner;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * The picture handling behind the assistant's photo suggestions (owner, 2026-11-24):
 * reading a stored picture to show the assistant, cutting a dish photo to the menu's
 * 4:3 around where the dish is, keeping a preview until someone decides, and putting an
 * approved picture on the dish through the same steps an upload takes
 * (MenuImageProcessor: the 1200 × 900 picture, its thumbnail and their WebP).
 */
class PhotoWork
{
    private const PREVIEWS = 'ai-previews';

    public function __construct(private readonly MenuImageProcessor $processor) {}

    /** A stored picture's bytes by its /storage/ address; null when it is not ours or is gone. */
    public function bytes(?string $url): ?string
    {
        $path = MediaFileCleaner::storagePathFromUrl($url);
        if ($path === null || !Storage::disk('public')->exists($path)) {
            return null;
        }
        $bytes = Storage::disk('public')->get($path);

        return is_string($bytes) && $bytes !== '' ? $bytes : null;
    }

    /**
     * A picture small enough to send: a JPEG at most $edge on its long side.
     *
     * @return array{bytes: string, mime: string, w: int, h: int}|null with the picture's own size
     */
    public function forLooking(string $bytes, int $edge = 1400): ?array
    {
        $img = @imagecreatefromstring($bytes);
        if ($img === false) {
            return null;
        }
        [$w, $h] = [imagesx($img), imagesy($img)];
        $k = min(1.0, $edge / max($w, $h));
        $out = $this->canvas((int) max(1, round($w * $k)), (int) max(1, round($h * $k)));
        imagecopyresampled($out, $img, 0, 0, 0, 0, imagesx($out), imagesy($out), $w, $h);
        $jpeg = $this->jpeg($out);
        imagedestroy($img);
        imagedestroy($out);

        return ['bytes' => $jpeg, 'mime' => 'image/jpeg', 'w' => $w, 'h' => $h];
    }

    /**
     * The 4:3 cut that shows the dish whole and in the middle.
     *
     * @param array{x: float, y: float, w: float, h: float} $box where the dish is, as shares of the picture
     * @return array{x: int, y: int, w: int, h: int} in the picture's own pixels
     */
    public static function cropFor(int $w, int $h, array $box): array
    {
        $bx = max(0.0, min(1.0, $box['x'])) * $w;
        $by = max(0.0, min(1.0, $box['y'])) * $h;
        $bw = max(0.02, min(1.0, $box['w'])) * $w;
        $bh = max(0.02, min(1.0, $box['h'])) * $h;
        // Room round the dish: a sixth of it each side.
        $needW = $bw * 1.34;
        $needH = $bh * 1.34;
        $cw = max($needW, $needH * 4 / 3);
        $ch = $cw * 3 / 4;
        // Never larger than the picture.
        $k = min(1.0, $w / $cw, $h / $ch);
        $cw *= $k;
        $ch *= $k;
        $cx = max(0.0, min($w - $cw, $bx + $bw / 2 - $cw / 2));
        $cy = max(0.0, min($h - $ch, $by + $bh / 2 - $ch / 2));

        return ['x' => (int) round($cx), 'y' => (int) round($cy), 'w' => (int) floor($cw), 'h' => (int) floor($ch)];
    }

    /** The cut the menu makes by itself: the largest 4:3 from the middle. */
    public static function middleCrop(int $w, int $h): array
    {
        $cw = min($w, $h * 4 / 3);
        $ch = $cw * 3 / 4;

        return ['x' => (int) round(($w - $cw) / 2), 'y' => (int) round(($h - $ch) / 2), 'w' => (int) floor($cw), 'h' => (int) floor($ch)];
    }

    /** How far apart two cuts are, as a share of the picture: 0 the same, 1 nothing in common. */
    public static function apart(array $a, array $b): float
    {
        $ix = max(0, min($a['x'] + $a['w'], $b['x'] + $b['w']) - max($a['x'], $b['x']));
        $iy = max(0, min($a['y'] + $a['h'], $b['y'] + $b['h']) - max($a['y'], $b['y']));
        $union = $a['w'] * $a['h'] + $b['w'] * $b['h'] - $ix * $iy;

        return $union > 0 ? 1.0 - ($ix * $iy) / $union : 0.0;
    }

    /**
     * Cut a picture to a rectangle, as a 4:3 JPEG.
     *
     * @param array{x: int, y: int, w: int, h: int} $crop
     */
    public function cut(string $bytes, array $crop): ?string
    {
        $img = @imagecreatefromstring($bytes);
        if ($img === false || $crop['w'] < 40 || $crop['h'] < 30) {
            return null;
        }
        $tw = min(2400, $crop['w']);
        $out = $this->canvas($tw, (int) round($tw * 3 / 4));
        imagecopyresampled($out, $img, 0, 0, $crop['x'], $crop['y'], imagesx($out), imagesy($out), $crop['w'], $crop['h']);
        $jpeg = $this->jpeg($out, 90);
        imagedestroy($img);
        imagedestroy($out);

        return $jpeg;
    }

    /** Keep a picture for a person to look at before deciding. @return string its /storage/ address */
    public function keepPreview(string $bytes): string
    {
        $img = @imagecreatefromstring($bytes);
        $ext = 'jpg';
        if ($img !== false) {
            // A made picture may come as a large PNG: a JPEG of a sensible size is what is kept.
            [$w, $h] = [imagesx($img), imagesy($img)];
            $k = min(1.0, 2400 / max($w, $h));
            $out = $this->canvas((int) round($w * $k), (int) round($h * $k));
            imagecopyresampled($out, $img, 0, 0, 0, 0, imagesx($out), imagesy($out), $w, $h);
            $bytes = $this->jpeg($out, 90);
            imagedestroy($img);
            imagedestroy($out);
        }
        $path = self::PREVIEWS . '/' . Str::uuid()->toString() . '.' . $ext;
        Storage::disk('public')->put($path, $bytes);

        return '/storage/' . $path;
    }

    /** Forget a preview nobody needs any more. Only ever a file this class kept. */
    public function dropPreview(?string $url): void
    {
        $path = MediaFileCleaner::storagePathFromUrl($url);
        if ($path !== null && str_starts_with($path, self::PREVIEWS . '/')) {
            Storage::disk('public')->delete($path);
        }
    }

    /**
     * Put a picture on a dish, as an upload would: the menu's picture, its thumbnail and
     * their WebP. The dish's own master is kept unless this picture is a new one.
     */
    public function install(Item $item, string $bytes, bool $newMaster, bool $generated): void
    {
        $tmp = tempnam(sys_get_temp_dir(), 'aiphoto');
        file_put_contents($tmp, $bytes);
        try {
            $file = new UploadedFile($tmp, 'photo.jpg', 'image/jpeg', null, true);
            $processed = $this->processor->storeProcessedPair($file, 'menu');
            $thumb = $this->processor->storeThumbnailPair($file);
            $set = [
                'image_url' => '/storage/' . ltrim($processed['path'], '/'),
                'thumb_url' => '/storage/' . ltrim($thumb['path'], '/'),
                'image_webp_url' => $processed['webp_path'] ? '/storage/' . ltrim($processed['webp_path'], '/') : null,
                'thumb_webp_url' => $thumb['webp_path'] ? '/storage/' . ltrim($thumb['webp_path'], '/') : null,
            ];
            if ($newMaster) {
                $set['image_original_url'] = '/storage/' . ltrim($this->processor->storeMaster($file, 'menu-masters'), '/');
            }
            $item->forceFill($set + ['image_ai_generated' => $generated])->save();
        } finally {
            @unlink($tmp);
        }
    }

    private function canvas(int $w, int $h): \GdImage
    {
        $out = imagecreatetruecolor(max(1, $w), max(1, $h));
        imagefilledrectangle($out, 0, 0, $w, $h, (int) imagecolorallocate($out, 255, 255, 255));

        return $out;
    }

    private function jpeg(\GdImage $img, int $quality = 85): string
    {
        ob_start();
        imagejpeg($img, null, $quality);

        return (string) ob_get_clean();
    }
}
