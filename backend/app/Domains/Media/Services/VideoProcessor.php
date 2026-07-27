<?php

declare(strict_types=1);

namespace App\Domains\Media\Services;

use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * FFmpeg-backed video tools for hero / media library studio.
 * Trim, aspect crop, poster frame, export (muted H.264 mp4).
 */
final class VideoProcessor
{
    public function available(): bool
    {
        try {
            $ffmpeg = Process::timeout(10)->run(['ffmpeg', '-version']);
            $ffprobe = Process::timeout(10)->run(['ffprobe', '-version']);

            return $ffmpeg->successful() && $ffprobe->successful();
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * @return array{duration: float, width: int, height: int, codec: string}
     */
    public function probe(string $absolutePath): array
    {
        $this->assertReadable($absolutePath);

        $result = Process::timeout(30)->run([
            'ffprobe', '-v', 'quiet', '-print_format', 'json',
            '-show_format', '-show_streams', $absolutePath,
        ]);

        if (! $result->successful()) {
            throw new RuntimeException('Could not probe video: '.$result->errorOutput());
        }

        /** @var array<string, mixed> $data */
        $data = json_decode($result->output(), true) ?: [];
        $streams = is_array($data['streams'] ?? null) ? $data['streams'] : [];
        $video = null;
        foreach ($streams as $stream) {
            if (($stream['codec_type'] ?? '') === 'video') {
                $video = $stream;
                break;
            }
        }

        $duration = (float) ($data['format']['duration'] ?? ($video['duration'] ?? 0));
        $width = (int) ($video['width'] ?? 0);
        $height = (int) ($video['height'] ?? 0);
        $codec = (string) ($video['codec_name'] ?? '');

        return [
            'duration' => max(0, $duration),
            'width' => max(0, $width),
            'height' => max(0, $height),
            'codec' => $codec,
        ];
    }

    /**
     * Resolve a public /storage/… URL or relative path to an absolute disk path.
     */
    public function resolvePublicPath(string $urlOrPath): string
    {
        $path = trim($urlOrPath);
        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            $parsed = parse_url($path, PHP_URL_PATH) ?: '';
            $path = (string) $parsed;
        }
        $path = '/'.ltrim($path, '/');
        if (! str_starts_with($path, '/storage/')) {
            throw new RuntimeException('Video path must be under /storage/.');
        }
        $rel = ltrim(substr($path, strlen('/storage/')), '/');
        $absolute = Storage::disk('public')->path($rel);
        $this->assertUnderPublicDisk($absolute);
        $this->assertReadable($absolute);

        return $absolute;
    }

    /**
     * @param  array{
     *   trim_start?: float|int|string,
     *   trim_end?: float|int|string|null,
     *   aspect?: string,
     *   crop?: array{x?: int|float, y?: int|float, w?: int|float, h?: int|float},
     *   poster_at?: float|int|string|null,
     * }  $options
     * @return array{url: string, poster_url: string, duration: float, width: int, height: int, path: string, poster_path: string}
     */
    public function process(string $sourceAbsolute, array $options = [], string $outputDir = 'library/video/studio'): array
    {
        if (! $this->available()) {
            throw new RuntimeException('FFmpeg is not available on this server.');
        }

        $meta = $this->probe($sourceAbsolute);
        $duration = $meta['duration'];
        $srcW = $meta['width'];
        $srcH = $meta['height'];

        $trimStart = max(0.0, (float) ($options['trim_start'] ?? 0));
        $trimEndRaw = $options['trim_end'] ?? null;
        $trimEnd = $trimEndRaw === null || $trimEndRaw === ''
            ? $duration
            : (float) $trimEndRaw;
        $trimEnd = min($duration, max($trimStart + 0.2, $trimEnd));

        $crop = $this->resolveCrop(
            $srcW,
            $srcH,
            (string) ($options['aspect'] ?? 'original'),
            is_array($options['crop'] ?? null) ? $options['crop'] : null,
        );

        $posterAt = $options['poster_at'] ?? null;
        $posterAt = $posterAt === null || $posterAt === ''
            ? $trimStart
            : (float) $posterAt;
        $posterAt = min($trimEnd - 0.05, max($trimStart, $posterAt));

        Storage::disk('public')->makeDirectory($outputDir);
        Storage::disk('public')->makeDirectory($outputDir.'/posters');

        $uuid = Str::uuid()->toString();
        $outRel = $outputDir.'/'.$uuid.'.mp4';
        $posterRel = $outputDir.'/posters/'.$uuid.'.jpg';
        $outAbs = Storage::disk('public')->path($outRel);
        $posterAbs = Storage::disk('public')->path($posterRel);

        $vf = sprintf(
            'crop=%d:%d:%d:%d,scale=trunc(iw/2)*2:trunc(ih/2)*2',
            $crop['w'],
            $crop['h'],
            $crop['x'],
            $crop['y'],
        );

        // Accurate trim: -ss after -i; muted for hero background use.
        $export = Process::timeout(180)->run([
            'ffmpeg', '-y',
            '-i', $sourceAbsolute,
            '-ss', $this->fmtTime($trimStart),
            '-to', $this->fmtTime($trimEnd),
            '-vf', $vf,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-an',
            $outAbs,
        ]);

        if (! $export->successful() || ! is_file($outAbs)) {
            throw new RuntimeException('Video export failed: '.$export->errorOutput());
        }

        $poster = Process::timeout(60)->run([
            'ffmpeg', '-y',
            '-ss', $this->fmtTime($posterAt),
            '-i', $sourceAbsolute,
            '-vf', $vf,
            '-frames:v', '1',
            '-q:v', '3',
            $posterAbs,
        ]);

        if (! $poster->successful() || ! is_file($posterAbs)) {
            throw new RuntimeException('Poster export failed: '.$poster->errorOutput());
        }

        $outMeta = $this->probe($outAbs);

        return [
            'url' => '/storage/'.ltrim($outRel, '/'),
            'poster_url' => '/storage/'.ltrim($posterRel, '/'),
            'duration' => $outMeta['duration'],
            'width' => $outMeta['width'],
            'height' => $outMeta['height'],
            'path' => $outRel,
            'poster_path' => $posterRel,
        ];
    }

    /**
     * @param  array{x?: int|float, y?: int|float, w?: int|float, h?: int|float}|null  $manual
     * @return array{x: int, y: int, w: int, h: int}
     */
    private function resolveCrop(int $srcW, int $srcH, string $aspect, ?array $manual): array
    {
        if ($manual && isset($manual['w'], $manual['h']) && (float) $manual['w'] > 0 && (float) $manual['h'] > 0) {
            $w = max(2, min($srcW, (int) round((float) $manual['w'])));
            $h = max(2, min($srcH, (int) round((float) $manual['h'])));
            $x = max(0, min($srcW - $w, (int) round((float) ($manual['x'] ?? 0))));
            $y = max(0, min($srcH - $h, (int) round((float) ($manual['y'] ?? 0))));

            return ['x' => $x, 'y' => $y, 'w' => $w - ($w % 2), 'h' => $h - ($h % 2)];
        }

        $ratio = match ($aspect) {
            '16:9' => 16 / 9,
            '4:5' => 4 / 5,
            '1:1' => 1.0,
            '9:16' => 9 / 16,
            default => null,
        };

        if ($ratio === null || $srcW < 2 || $srcH < 2) {
            return [
                'x' => 0,
                'y' => 0,
                'w' => $srcW - ($srcW % 2),
                'h' => $srcH - ($srcH % 2),
            ];
        }

        $srcRatio = $srcW / max(1, $srcH);
        if ($srcRatio > $ratio) {
            // Too wide — crop sides
            $h = $srcH - ($srcH % 2);
            $w = (int) round($h * $ratio);
            $w = $w - ($w % 2);
            $x = (int) max(0, floor(($srcW - $w) / 2));
            $y = 0;
        } else {
            // Too tall — crop top/bottom
            $w = $srcW - ($srcW % 2);
            $h = (int) round($w / $ratio);
            $h = $h - ($h % 2);
            $x = 0;
            $y = (int) max(0, floor(($srcH - $h) / 2));
        }

        return [
            'x' => min($x, max(0, $srcW - $w)),
            'y' => min($y, max(0, $srcH - $h)),
            'w' => max(2, $w),
            'h' => max(2, $h),
        ];
    }

    private function fmtTime(float $seconds): string
    {
        return number_format(max(0, $seconds), 3, '.', '');
    }

    private function assertReadable(string $absolutePath): void
    {
        if (! is_file($absolutePath) || ! is_readable($absolutePath)) {
            throw new RuntimeException('Video file not found or not readable.');
        }
    }

    private function assertUnderPublicDisk(string $absolutePath): void
    {
        $root = realpath(Storage::disk('public')->path('')) ?: Storage::disk('public')->path('');
        $real = realpath($absolutePath) ?: $absolutePath;
        if (! str_starts_with($real, rtrim($root, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR) && $real !== $root) {
            throw new RuntimeException('Video path escapes public storage.');
        }
    }
}
