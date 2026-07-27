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
 *
 * Compatible with FFmpeg 4.4+ (cPanel/RHEL) and iPhone .mov sources.
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
     * @return array{duration: float, width: int, height: int, codec: string, rotation: int}
     */
    public function probe(string $absolutePath): array
    {
        $this->assertReadable($absolutePath);

        $result = Process::timeout(30)->run([
            'ffprobe', '-v', 'quiet', '-print_format', 'json',
            '-show_format', '-show_streams', $absolutePath,
        ]);

        if (! $result->successful()) {
            throw new RuntimeException('Could not probe video: '.$this->shortError($result->errorOutput()));
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

        if (! is_array($video)) {
            throw new RuntimeException('No video stream found in file.');
        }

        $duration = (float) ($data['format']['duration'] ?? ($video['duration'] ?? 0));
        $width = (int) ($video['width'] ?? 0);
        $height = (int) ($video['height'] ?? 0);
        $codec = (string) ($video['codec_name'] ?? '');
        $rotation = $this->rotationDegrees($video);

        // Display size (after rotation) — used for UI; export uses coded size + -noautorotate.
        if (in_array(abs($rotation) % 180, [90], true)) {
            [$width, $height] = [$height, $width];
        }

        return [
            'duration' => max(0, $duration),
            'width' => max(0, $width),
            'height' => max(0, $height),
            'codec' => $codec,
            'rotation' => $rotation,
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

        $coded = $this->probeCodedSize($sourceAbsolute);
        $duration = $coded['duration'];
        $srcW = $coded['width'];
        $srcH = $coded['height'];

        if ($srcW < 2 || $srcH < 2) {
            throw new RuntimeException('Could not read video dimensions.');
        }

        $trimStart = max(0.0, (float) ($options['trim_start'] ?? 0));
        $trimEndRaw = $options['trim_end'] ?? null;
        $trimEnd = $trimEndRaw === null || $trimEndRaw === ''
            ? $duration
            : (float) $trimEndRaw;
        $trimEnd = min($duration, max($trimStart + 0.2, $trimEnd));
        $trimDur = max(0.2, $trimEnd - $trimStart);

        $aspect = (string) ($options['aspect'] ?? 'original');
        $crop = $this->resolveCrop(
            $srcW,
            $srcH,
            $aspect,
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

        $vf = $this->buildVideoFilter($crop, $aspect);

        // -noautorotate: crop coords match coded size (iPhone .mov).
        // -t duration: more reliable than -to on FFmpeg 4.4.
        $export = Process::timeout(300)->run([
            'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
            '-noautorotate',
            '-i', $sourceAbsolute,
            '-ss', $this->fmtTime($trimStart),
            '-t', $this->fmtTime($trimDur),
            '-vf', $vf,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '23',
            '-profile:v', 'main',
            '-level', '4.0',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-an',
            $outAbs,
        ]);

        if (! $export->successful() || ! is_file($outAbs) || filesize($outAbs) < 32) {
            @unlink($outAbs);
            throw new RuntimeException('Video export failed: '.$this->shortError($export->errorOutput().$export->output()));
        }

        $poster = Process::timeout(90)->run([
            'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
            '-noautorotate',
            '-ss', $this->fmtTime($posterAt),
            '-i', $sourceAbsolute,
            '-vf', $vf,
            '-frames:v', '1',
            '-q:v', '3',
            $posterAbs,
        ]);

        if (! $poster->successful() || ! is_file($posterAbs)) {
            @unlink($outAbs);
            throw new RuntimeException('Poster export failed: '.$this->shortError($poster->errorOutput().$poster->output()));
        }

        $outMeta = $this->probeCodedSize($outAbs);

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
     * Coded (storage) dimensions — ignore display rotation.
     *
     * @return array{duration: float, width: int, height: int, codec: string}
     */
    private function probeCodedSize(string $absolutePath): array
    {
        $this->assertReadable($absolutePath);

        $result = Process::timeout(30)->run([
            'ffprobe', '-v', 'quiet', '-print_format', 'json',
            '-show_format', '-show_streams', $absolutePath,
        ]);

        if (! $result->successful()) {
            throw new RuntimeException('Could not probe video: '.$this->shortError($result->errorOutput()));
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

        return [
            'duration' => max(0, (float) ($data['format']['duration'] ?? ($video['duration'] ?? 0))),
            'width' => max(0, (int) ($video['width'] ?? 0)),
            'height' => max(0, (int) ($video['height'] ?? 0)),
            'codec' => (string) ($video['codec_name'] ?? ''),
        ];
    }

    /**
     * @param  array{x: int, y: int, w: int, h: int}  $crop
     */
    private function buildVideoFilter(array $crop, string $aspect): string
    {
        // Skip crop for original — iPhone MOVs + FFmpeg 4.4 are happiest with scale only.
        if ($aspect === 'original') {
            return 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p';
        }

        $w = max(2, $crop['w'] & ~1);
        $h = max(2, $crop['h'] & ~1);
        $x = max(0, $crop['x'] & ~1);
        $y = max(0, $crop['y'] & ~1);

        return sprintf(
            'crop=%d:%d:%d:%d,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
            $w,
            $h,
            $x,
            $y,
        );
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

            return ['x' => $x & ~1, 'y' => $y & ~1, 'w' => $w & ~1, 'h' => $h & ~1];
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
                'w' => $srcW & ~1,
                'h' => $srcH & ~1,
            ];
        }

        $srcRatio = $srcW / max(1, $srcH);
        if ($srcRatio > $ratio) {
            $h = $srcH & ~1;
            $w = ((int) round($h * $ratio)) & ~1;
            $w = max(2, min($srcW, $w));
            $x = (int) max(0, floor(($srcW - $w) / 2)) & ~1;
            $y = 0;
        } else {
            $w = $srcW & ~1;
            $h = ((int) round($w / $ratio)) & ~1;
            $h = max(2, min($srcH, $h));
            $x = 0;
            $y = (int) max(0, floor(($srcH - $h) / 2)) & ~1;
        }

        // Ensure crop rectangle fits inside the frame.
        if ($x + $w > $srcW) {
            $w = ($srcW - $x) & ~1;
        }
        if ($y + $h > $srcH) {
            $h = ($srcH - $y) & ~1;
        }

        return [
            'x' => max(0, $x),
            'y' => max(0, $y),
            'w' => max(2, $w),
            'h' => max(2, $h),
        ];
    }

    /** @param  array<string, mixed>  $video */
    private function rotationDegrees(array $video): int
    {
        $tags = is_array($video['tags'] ?? null) ? $video['tags'] : [];
        if (isset($tags['rotate'])) {
            return (int) $tags['rotate'];
        }
        foreach ($video['side_data_list'] ?? [] as $side) {
            if (! is_array($side)) {
                continue;
            }
            if (($side['side_data_type'] ?? '') === 'Display Matrix' && isset($side['rotation'])) {
                return (int) round((float) $side['rotation']);
            }
        }

        return 0;
    }

    private function fmtTime(float $seconds): string
    {
        return number_format(max(0, $seconds), 3, '.', '');
    }

    private function shortError(string $stderr): string
    {
        $stderr = trim($stderr);
        if ($stderr === '') {
            return 'unknown FFmpeg error';
        }
        // Drop the long version banner; keep the last meaningful lines.
        $lines = preg_split("/\r\n|\n|\r/", $stderr) ?: [];
        $useful = array_values(array_filter($lines, static function (string $line): bool {
            $line = trim($line);
            if ($line === '') {
                return false;
            }
            if (str_starts_with($line, 'ffmpeg version')) {
                return false;
            }
            if (str_starts_with($line, 'built with') || str_starts_with($line, 'configuration:')) {
                return false;
            }
            if (str_starts_with($line, 'libav') || str_starts_with($line, 'libsw') || str_starts_with($line, 'libpost')) {
                return false;
            }

            return true;
        }));

        $tail = array_slice($useful, -6);

        return implode(' · ', $tail) ?: 'Conversion failed';
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
