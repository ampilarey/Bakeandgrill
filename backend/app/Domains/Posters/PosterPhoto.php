<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use GdImage;
use RuntimeException;

/**
 * A photo made ready for the print PDF (docs/POSTER_PLAN.md § 7).
 *
 * GD does the one thing it is good for here: crop to the frame's shape and
 * scale once to the frame's resolution, so the PDF carries the pixels the
 * print needs and no more. The JPEG then gets an sRGB profile written into
 * it (APP2 ICC_PROFILE, which TCPDF reads and embeds as an ICCBased colour
 * space): PDF/X-4 allows RGB pictures only with their profile, never bare
 * DeviceRGB. The sRGB profile is the one TCPDF ships.
 */
final class PosterPhoto
{
    public const JPEG_QUALITY = 92;

    /**
     * The picture cropped to cover $wMm × $hMm at $ppi, as JPEG bytes with
     * an sRGB profile. Returns the pixel size it came out at too.
     *
     * @return array{jpeg: string, w: int, h: int, source_w: int, source_h: int}
     */
    public static function cover(string $path, float $wMm, float $hMm, int $ppi): array
    {
        $src = self::open($path);
        $sw = imagesx($src);
        $sh = imagesy($src);

        $tw = (int) ceil($wMm / 25.4 * $ppi);
        $th = (int) ceil($hMm / 25.4 * $ppi);
        // Never upscale: the preflight reports the ppi the source allows.
        $scale = min(1.0, $sw / $tw, $sh / $th);
        if ($scale < 1.0) {
            $tw = (int) floor($tw * $scale);
            $th = (int) floor($th * $scale);
        }

        $srcRatio = $sw / $sh;
        $dstRatio = $tw / $th;
        if ($srcRatio > $dstRatio) {
            $cw = (int) round($sh * $dstRatio);
            $ch = $sh;
            $cx = (int) floor(($sw - $cw) / 2);
            $cy = 0;
        } else {
            $cw = $sw;
            $ch = (int) round($sw / $dstRatio);
            $cx = 0;
            $cy = (int) floor(($sh - $ch) / 2);
        }

        $dst = imagecreatetruecolor($tw, $th);
        if (!$dst instanceof GdImage) {
            throw new RuntimeException('GD could not make the poster photo.');
        }
        imagecopyresampled($dst, $src, 0, 0, $cx, $cy, $tw, $th, $cw, $ch);
        imagedestroy($src);

        ob_start();
        imagejpeg($dst, null, self::JPEG_QUALITY);
        $jpeg = (string) ob_get_clean();
        imagedestroy($dst);

        return ['jpeg' => self::withSrgbProfile($jpeg), 'w' => $tw, 'h' => $th, 'source_w' => $sw, 'source_h' => $sh];
    }

    /** The JPEG with TCPDF's sRGB profile in an APP2 segment, after the JFIF header. */
    public static function withSrgbProfile(string $jpeg): string
    {
        if (str_contains(substr($jpeg, 0, 4096), "ICC_PROFILE\0")) {
            return $jpeg;
        }
        $icc = self::srgbProfile();
        if ($icc === null) {
            return $jpeg;
        }
        $payload = "ICC_PROFILE\0" . chr(1) . chr(1) . $icc;
        $segment = "\xFF\xE2" . pack('n', strlen($payload) + 2) . $payload;

        // After SOI, and after an APP0 (JFIF) segment when there is one.
        $at = 2;
        if (substr($jpeg, 2, 2) === "\xFF\xE0") {
            $len = unpack('n', substr($jpeg, 4, 2))[1] ?? 0;
            $at = 4 + $len;
        }

        return substr($jpeg, 0, $at) . $segment . substr($jpeg, $at);
    }

    public static function srgbProfile(): ?string
    {
        $candidates = [
            base_path('vendor/tecnickcom/tcpdf/include/sRGB.icc'),
        ];
        foreach ($candidates as $file) {
            if (is_file($file)) {
                $bytes = file_get_contents($file);
                if ($bytes !== false && strlen($bytes) > 128 && strlen($bytes) < 65000) {
                    return $bytes;
                }
            }
        }

        return null;
    }

    /**
     * A stand-in photo for the spike when none is given: a warm plate on a
     * dark cloth, with enough detail to show resolution and compression.
     */
    public static function synthetic(int $w, int $h): string
    {
        $im = imagecreatetruecolor($w, $h);
        if (!$im instanceof GdImage) {
            throw new RuntimeException('GD could not make the stand-in photo.');
        }
        // Background: dark brown to near-black, top to bottom.
        for ($y = 0; $y < $h; $y++) {
            $t = $y / max(1, $h - 1);
            $col = imagecolorallocate($im, (int) (46 - 26 * $t), (int) (30 - 18 * $t), (int) (16 - 10 * $t));
            imageline($im, 0, $y, $w, $y, $col);
        }
        // A plate, slightly above centre, and a few "pieces" on it.
        $cx = (int) ($w * 0.5);
        $cy = (int) ($h * 0.38);
        $r = (int) (min($w, $h) * 0.36);
        imagefilledellipse($im, $cx + (int) ($r * 0.04), $cy + (int) ($r * 0.06), 2 * $r, 2 * $r, imagecolorallocate($im, 14, 10, 6));
        imagefilledellipse($im, $cx, $cy, 2 * $r, 2 * $r, imagecolorallocate($im, 247, 245, 242));
        imagefilledellipse($im, $cx, $cy, (int) (1.7 * $r), (int) (1.7 * $r), imagecolorallocate($im, 236, 230, 222));
        mt_srand(7);
        for ($i = 0; $i < 9; $i++) {
            $a = $i / 9 * 2 * M_PI;
            $d = $r * (0.25 + 0.35 * (($i % 3) / 2));
            $px = (int) ($cx + cos($a) * $d);
            $py = (int) ($cy + sin($a) * $d * 0.8);
            $pr = (int) ($r * (0.16 + 0.05 * ($i % 2)));
            imagefilledellipse($im, $px, $py, 2 * $pr, (int) (1.6 * $pr), imagecolorallocate($im, 183 + mt_rand(-20, 20), 75 + mt_rand(-15, 25), 12 + mt_rand(0, 20)));
            imagefilledellipse($im, $px - (int) ($pr * 0.3), $py - (int) ($pr * 0.3), (int) ($pr * 0.7), (int) ($pr * 0.5), imagecolorallocate($im, 230, 150, 60));
        }
        // Fine texture so compression and resolution show.
        for ($i = 0; $i < ($w * $h) / 400; $i++) {
            $x = mt_rand(0, $w - 1);
            $y = mt_rand(0, $h - 1);
            $rgb = imagecolorat($im, $x, $y);
            $rr = min(255, (($rgb >> 16) & 0xFF) + mt_rand(-6, 6));
            $gg = min(255, (($rgb >> 8) & 0xFF) + mt_rand(-6, 6));
            $bb = min(255, ($rgb & 0xFF) + mt_rand(-6, 6));
            imagesetpixel($im, $x, $y, imagecolorallocate($im, max(0, $rr), max(0, $gg), max(0, $bb)));
        }
        ob_start();
        imagejpeg($im, null, self::JPEG_QUALITY);
        imagedestroy($im);

        return (string) ob_get_clean();
    }

    private static function open(string $path): GdImage
    {
        $bytes = @file_get_contents($path);
        if ($bytes === false) {
            throw new RuntimeException("Photo not readable: {$path}");
        }
        $im = @imagecreatefromstring($bytes);
        if (!$im instanceof GdImage) {
            throw new RuntimeException("Photo is not a picture GD can read: {$path}");
        }

        return $im;
    }
}
