<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Domains\Media\Services\VideoProcessor;
use App\Models\Item;
use App\Models\SocialVideoRendition;
use App\Services\EffectivePriceService;
use App\Support\SocialPreviewImage;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Composes an item's REAL photos into a short, silent, branded clip
 * (Ken Burns zoom/pan per photo, crossfades, closing card with item name +
 * price) in the three per-platform formats. Runs on the dedicated `social`
 * queue so a render can never delay payments/orders/SMS.
 *
 * Reuses the existing media stack: VideoProcessor's configured ffmpeg
 * binaries (media.ffmpeg_path — cPanel php-fpm PATH is thin) and the public
 * storage disk. Deliberately conservative output settings (720-class,
 * veryfast, CRF 27) — raise only after the TEST benchmark says the host
 * can afford it (social:video-benchmark is the hard gate).
 */
class SocialVideoRenderer
{
    // Bump to invalidate all renders when the composition itself changes.
    private const COMPOSITION_VERSION = 'v1';

    private const SECONDS_PER_PHOTO = 3.0;

    private const CARD_SECONDS = 2.5;

    private const FPS = 25;

    private const MAX_PHOTOS = 4;

    public function __construct(
        private readonly VideoProcessor $video,
        private readonly SocialPreviewImage $previews,
    ) {}

    public function available(): bool
    {
        return $this->video->available();
    }

    /**
     * Real, locally-stored photos only — never the site fallback/logo.
     *
     * @return list<string> absolute paths
     */
    public function sourcePhotoPaths(Item $item): array
    {
        $item->loadMissing('photos');
        $paths = [];
        foreach ($item->photos as $photo) {
            if ($photo->isVideo()) {
                continue;
            }
            $url = (string) $photo->url;
            if ($url === '' || !$this->previews->isShareableRaster($url)) {
                continue;
            }
            try {
                $paths[] = $this->video->resolvePublicPath($url);
            } catch (\Throwable) {
                // Remote or missing file — not usable as a render source.
            }
            if (count($paths) >= self::MAX_PHOTOS) {
                break;
            }
        }
        if ($paths === [] && trim((string) $item->image_url) !== '') {
            try {
                $paths[] = $this->video->resolvePublicPath((string) $item->image_url);
            } catch (\Throwable) {
                // fall through — no usable photos
            }
        }

        return $paths;
    }

    /** Photo set + name + price + composition settings. */
    public function fingerprint(Item $item): string
    {
        $price = app(EffectivePriceService::class)
            ->resolveUnitPrice($item->id, (float) $item->base_price, $item)->unitPrice;

        return sha1(implode('|', [
            self::COMPOSITION_VERSION,
            $item->id,
            (string) $item->name,
            trim((string) ($item->name_dv ?? '')),
            number_format((float) $price, 2),
            implode(',', $this->sourcePhotoPaths($item)),
        ]));
    }

    /**
     * Render one format synchronously (call from the queued job only).
     * Replaces the rendition's previous files on success.
     */
    public function render(SocialVideoRendition $rendition): void
    {
        if (!$this->available()) {
            throw new RuntimeException('ffmpeg is not available on this host.');
        }

        $item = $rendition->item()->with('photos')->firstOrFail();
        $spec = SocialVideoRendition::FORMATS[$rendition->format]
            ?? throw new RuntimeException("Unknown format [{$rendition->format}].");
        $photos = $this->sourcePhotoPaths($item);
        if ($photos === []) {
            throw new RuntimeException('Item has no usable photos — automated video never uses placeholders.');
        }

        $w = $spec['width'];
        $h = $spec['height'];
        $tmpDir = storage_path('app/social-video-tmp/' . $rendition->id);
        @mkdir($tmpDir, 0775, true);

        try {
            $card = $this->makeClosingCard($item, $w, $h, $tmpDir);
            $inputs = [...$photos, $card];

            $outRel = sprintf('social-videos/%d/%s-%s.mp4', $item->id, $rendition->format, substr($rendition->source_fingerprint, 0, 8));
            $posterRel = sprintf('social-videos/%d/%s-%s.jpg', $item->id, $rendition->format, substr($rendition->source_fingerprint, 0, 8));
            $outAbs = Storage::disk('public')->path($outRel);
            @mkdir(dirname($outAbs), 0775, true);

            $this->runFfmpeg($inputs, $w, $h, $outAbs);
            if (!is_file($outAbs) || filesize($outAbs) === 0) {
                throw new RuntimeException('Render produced no output file.');
            }

            $posterAbs = Storage::disk('public')->path($posterRel);
            Process::timeout(60)->run([
                $this->video->ffmpegBinary(), '-y', '-i', $outAbs,
                '-frames:v', '1', '-q:v', '3', $posterAbs,
            ]);

            $old = ['path' => $rendition->path, 'poster' => $rendition->poster_path];
            $rendition->forceFill([
                'status' => SocialVideoRendition::STATUS_READY,
                'width' => $w,
                'height' => $h,
                'bytes' => filesize($outAbs),
                'mime' => 'video/mp4',
                'path' => $outRel,
                'poster_path' => is_file($posterAbs) ? $posterRel : null,
                'error_message' => null,
            ])->save();

            // Retention: a replaced render's files go away with it.
            foreach ([$old['path'], $old['poster']] as $stale) {
                if ($stale && $stale !== $outRel && $stale !== $posterRel) {
                    Storage::disk('public')->delete($stale);
                }
            }
        } finally {
            $this->cleanupDir($tmpDir);
        }
    }

    /**
     * Ken Burns per photo + 0.5s crossfades + closing card, silent H.264.
     *
     * @param list<string> $inputs
     */
    private function runFfmpeg(array $inputs, int $w, int $h, string $outAbs): void
    {
        $fps = self::FPS;
        $fade = 0.5;
        $count = count($inputs);

        $cmd = [$this->video->ffmpegBinary(), '-y'];
        foreach ($inputs as $i => $path) {
            $secs = $i === $count - 1 ? self::CARD_SECONDS : self::SECONDS_PER_PHOTO;
            array_push($cmd, '-loop', '1', '-t', (string) $secs, '-i', $path);
        }

        $filters = [];
        foreach ($inputs as $i => $_) {
            $isCard = $i === $count - 1;
            $secs = $isCard ? self::CARD_SECONDS : self::SECONDS_PER_PHOTO;
            $frames = (int) round($secs * $fps);
            // Cover-scale into the frame; photos get a slow push-in
            // (alternating focal corner), the card stays static.
            $zoom = $isCard
                ? "zoompan=z=1:d={$frames}:s={$w}x{$h}:fps={$fps}"
                : sprintf(
                    "zoompan=z='min(zoom+0.0012,1.12)':x='%s':y='%s':d=%d:s=%dx%d:fps=%d",
                    $i % 2 === 0 ? 'iw/2-(iw/zoom/2)' : '0',
                    $i % 2 === 0 ? 'ih/2-(ih/zoom/2)' : '0',
                    $frames,
                    $w,
                    $h,
                    $fps,
                );
            $filters[] = sprintf(
                '[%d:v]scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,setsar=1,%s[v%d]',
                $i,
                $w,
                $h,
                $w,
                $h,
                $zoom,
                $i,
            );
        }

        // Chain xfade transitions.
        $label = 'v0';
        $offset = self::SECONDS_PER_PHOTO - $fade;
        for ($i = 1; $i < $count; $i++) {
            $next = $i === $count - 1 ? 'vout' : "x{$i}";
            $filters[] = sprintf(
                '[%s][v%d]xfade=transition=fade:duration=%.1f:offset=%.2f[%s]',
                $label,
                $i,
                $fade,
                $offset,
                $next,
            );
            $label = $next;
            $secs = $i === $count - 1 ? self::CARD_SECONDS : self::SECONDS_PER_PHOTO;
            $offset += $secs - $fade;
        }
        if ($count === 1) {
            $filters[count($filters) - 1] = str_replace('[v0]', '[vout]', $filters[count($filters) - 1]);
        }

        array_push(
            $cmd,
            '-filter_complex',
            implode(';', $filters),
            '-map',
            '[vout]',
            '-an',
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '27',
            '-pix_fmt',
            'yuv420p',
            '-movflags',
            '+faststart',
            $outAbs,
        );

        $result = Process::timeout(600)->run($cmd);
        if (!$result->successful()) {
            // Last lines only — ffmpeg banners are long and the tail has the error.
            $tail = implode("\n", array_slice(explode("\n", trim($result->errorOutput())), -6));
            throw new RuntimeException('ffmpeg failed: ' . $tail);
        }
    }

    /** Closing card: brand ground, item name (EN + DV), price, site URL. */
    private function makeClosingCard(Item $item, int $w, int $h, string $tmpDir): string
    {
        $img = imagecreatetruecolor($w, $h);
        $bg = imagecolorallocate($img, 0xF8, 0xF6, 0xF3);
        $dark = imagecolorallocate($img, 0x1C, 0x14, 0x08);
        $amber = imagecolorallocate($img, 0xD4, 0x81, 0x3A);
        imagefilledrectangle($img, 0, 0, $w, $h, $bg);

        $price = app(EffectivePriceService::class)
            ->resolveUnitPrice($item->id, (float) $item->base_price, $item)->unitPrice;
        $font = $this->fontFile();
        $centerY = (int) ($h / 2);

        if ($font !== null) {
            $this->centeredText($img, $font, (int) max(28, $w / 16), $dark, $w, $centerY - (int) ($h * 0.08), (string) $item->name);
            $dv = trim((string) ($item->name_dv ?? ''));
            if ($dv !== '') {
                $this->centeredText($img, $font, (int) max(22, $w / 22), $dark, $w, $centerY, $dv);
            }
            $this->centeredText($img, $font, (int) max(26, $w / 18), $amber, $w, $centerY + (int) ($h * 0.09), 'MVR ' . number_format((float) $price, 2));
            $this->centeredText($img, $font, (int) max(16, $w / 34), $dark, $w, $h - (int) ($h * 0.08), 'bakeandgrill.mv');
        } else {
            // No TTF available: built-in bitmap font keeps the card legible.
            $text = $item->name . '  MVR ' . number_format((float) $price, 2);
            imagestring($img, 5, max(0, (int) (($w - strlen($text) * 9) / 2)), $centerY, $text, $dark);
        }

        $path = $tmpDir . '/card.png';
        imagepng($img, $path);
        imagedestroy($img);

        return $path;
    }

    private function centeredText(\GdImage $img, string $font, int $size, int $color, int $w, int $y, string $text): void
    {
        $box = imagettfbbox($size, 0, $font, $text);
        $textW = abs($box[4] - $box[0]);
        imagettftext($img, $size, 0, (int) (($w - $textW) / 2), $y, $color, $font, $text);
    }

    /** Bundled A Faruma (covers Thaana + Latin), else DejaVu, else none. */
    private function fontFile(): ?string
    {
        foreach ([
            (string) config('social.video_font', ''),
            public_path('fonts/a_faruma.ttf'),
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        ] as $candidate) {
            if ($candidate !== '' && is_file($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    private function cleanupDir(string $dir): void
    {
        foreach (glob($dir . '/*') ?: [] as $file) {
            @unlink($file);
        }
        @rmdir($dir);
    }
}
