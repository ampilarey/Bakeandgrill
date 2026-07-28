<?php

declare(strict_types=1);

namespace App\Domains\Media\Services;

use App\Models\Media;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Schema;
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
    public const WEB_UNSAFE_MESSAGE = "This video format can't play in all browsers. Please upload an MP4 (H.264), or convert it first.";

    public function available(): bool
    {
        if ((bool) config('media.ffmpeg_disabled', false)) {
            return false;
        }

        try {
            $ffmpeg = Process::timeout(10)->run([$this->bin('ffmpeg'), '-version']);
            $ffprobe = Process::timeout(10)->run([$this->bin('ffprobe'), '-version']);

            return $ffmpeg->successful() && $ffprobe->successful();
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * Normalise an already-stored public-disk video to a web-safe H.264 MP4.
     * Fast path keeps byte-identical h264 .mp4 files; otherwise re-encodes in place
     * (replacing .mov/HEVC/etc). Applies display rotation into pixels on re-encode.
     *
     * @return array{
     *   absolute_path: string,
     *   relative_path: string,
     *   mime: string,
     *   extension: string,
     *   codec: string,
     *   converted: bool,
     * }
     */
    public function ensureWebSafe(string $absolutePath): array
    {
        $this->assertReadable($absolutePath);
        $this->assertUnderPublicDisk($absolutePath);

        $relativePath = $this->relativeFromAbsolute($absolutePath);
        $ext = strtolower((string) pathinfo($absolutePath, PATHINFO_EXTENSION));

        if (! $this->available()) {
            // Without FFmpeg we cannot verify codec or convert — only trust .mp4.
            if ($ext === 'mp4') {
                return [
                    'absolute_path' => $absolutePath,
                    'relative_path' => $relativePath,
                    'mime' => 'video/mp4',
                    'extension' => 'mp4',
                    'codec' => 'h264',
                    'converted' => false,
                ];
            }
            $this->discardStoredVideo($absolutePath, $relativePath);
            throw new RuntimeException(self::WEB_UNSAFE_MESSAGE);
        }

        try {
            $meta = $this->probeCodedSize($absolutePath);
        } catch (\Throwable) {
            $this->discardStoredVideo($absolutePath, $relativePath);
            throw new RuntimeException(self::WEB_UNSAFE_MESSAGE);
        }

        $codec = strtolower($meta['codec']);
        $isH264 = in_array($codec, ['h264', 'avc1'], true);

        if ($ext === 'mp4' && $isH264) {
            return [
                'absolute_path' => $absolutePath,
                'relative_path' => $relativePath,
                'mime' => 'video/mp4',
                'extension' => 'mp4',
                'codec' => $codec === 'avc1' ? 'h264' : $codec,
                'converted' => false,
            ];
        }

        $dir = dirname($absolutePath);
        $stem = (string) pathinfo($absolutePath, PATHINFO_FILENAME);
        if ($stem === '') {
            $stem = Str::uuid()->toString();
        }
        $newAbs = $dir.DIRECTORY_SEPARATOR.$stem.'.mp4';
        // Avoid clobbering the source when it is already named .mp4 (e.g. HEVC-in-mp4).
        $tmpAbs = $dir.DIRECTORY_SEPARATOR.$stem.'.websafe-'.Str::lower(Str::random(8)).'.mp4';

        $ff = $this->bin('ffmpeg');
        // Do NOT pass -noautorotate — bake display rotation into the pixels.
        $export = Process::timeout(300)->run([
            $ff, '-y', '-hide_banner', '-loglevel', 'error',
            '-i', $absolutePath,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-an',
            $tmpAbs,
        ]);

        if (! $export->successful() || ! is_file($tmpAbs) || filesize($tmpAbs) < 32) {
            @unlink($tmpAbs);
            $this->discardStoredVideo($absolutePath, $relativePath);
            throw new RuntimeException(
                'Video conversion failed: '.$this->shortError($export->errorOutput().$export->output())
            );
        }

        if ($absolutePath !== $newAbs && is_file($absolutePath)) {
            @unlink($absolutePath);
        }
        if ($tmpAbs !== $newAbs) {
            if (is_file($newAbs) && realpath($newAbs) !== realpath($tmpAbs)) {
                @unlink($newAbs);
            }
            if (! @rename($tmpAbs, $newAbs)) {
                if (! @copy($tmpAbs, $newAbs)) {
                    @unlink($tmpAbs);
                    throw new RuntimeException('Could not finalise converted video file.');
                }
                @unlink($tmpAbs);
            }
        }

        $newRel = $this->relativeFromAbsolute($newAbs);
        $this->remapMediaPath($relativePath, $newRel, 'video/mp4', (int) (@filesize($newAbs) ?: 0));

        $outCodec = 'h264';
        try {
            $outCodec = strtolower($this->probeCodedSize($newAbs)['codec'] ?: 'h264');
            if ($outCodec === 'avc1') {
                $outCodec = 'h264';
            }
        } catch (\Throwable) {
            // Probe is best-effort after a successful encode.
        }

        return [
            'absolute_path' => $newAbs,
            'relative_path' => $newRel,
            'mime' => 'video/mp4',
            'extension' => 'mp4',
            'codec' => $outCodec,
            'converted' => true,
        ];
    }

    /** Prefer FFMPEG_PATH / FFPROBE_PATH when cPanel PATH is thin for php-fpm. */
    private function bin(string $name): string
    {
        if ($name === 'ffmpeg') {
            $configured = (string) config('media.ffmpeg_path', env('FFMPEG_PATH', ''));
            if ($configured !== '' && is_executable($configured)) {
                return $configured;
            }
        }
        if ($name === 'ffprobe') {
            $configured = (string) config('media.ffprobe_path', env('FFPROBE_PATH', ''));
            if ($configured !== '' && is_executable($configured)) {
                return $configured;
            }
        }

        foreach (['/usr/bin/'.$name, '/usr/local/bin/'.$name, $name] as $candidate) {
            if ($candidate === $name) {
                return $name;
            }
            if (is_executable($candidate)) {
                return $candidate;
            }
        }

        return $name;
    }

    /**
     * @return array{duration: float, width: int, height: int, codec: string, rotation: int}
     */
    public function probe(string $absolutePath): array
    {
        $this->assertReadable($absolutePath);

        $result = Process::timeout(30)->run([
            $this->bin('ffprobe'), '-v', 'quiet', '-print_format', 'json',
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
        if ($width < 2) {
            $width = (int) ($video['coded_width'] ?? 0);
        }
        if ($height < 2) {
            $height = (int) ($video['coded_height'] ?? 0);
        }
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

        $sourceExt = strtolower((string) pathinfo($sourceAbsolute, PATHINFO_EXTENSION));
        $sourceCodec = strtolower($coded['codec']);
        $sourceIsH264Mp4 = $sourceExt === 'mp4' && in_array($sourceCodec, ['h264', 'avc1'], true);
        $hasTrim = $trimStart > 0.0005 || abs($trimEnd - $duration) > 0.05;
        $allowStreamCopy = $aspect === 'original' && $sourceIsH264Mp4 && ! $hasTrim;

        Storage::disk('public')->makeDirectory($outputDir);
        Storage::disk('public')->makeDirectory($outputDir.'/posters');

        $uuid = Str::uuid()->toString();
        $outRel = $outputDir.'/'.$uuid.'.mp4';
        $posterRel = $outputDir.'/posters/'.$uuid.'.jpg';
        $outAbs = Storage::disk('public')->path($outRel);
        $posterAbs = Storage::disk('public')->path($posterRel);

        $ew = max(2, $crop['w'] & ~1);
        $eh = max(2, $crop['h'] & ~1);
        $ex = max(0, $crop['x'] & ~1);
        $ey = max(0, $crop['y'] & ~1);
        $ss = $this->fmtTime($trimStart);
        $td = $this->fmtTime($trimDur);

        // Multiple FFmpeg 4.4 / iPhone-MOV strategies — first success wins.
        $exportAttempts = $this->buildExportAttempts(
            $sourceAbsolute,
            $outAbs,
            $ss,
            $td,
            $aspect,
            $ex,
            $ey,
            $ew,
            $eh,
            max(2, $srcW & ~1),
            max(2, $srcH & ~1),
            $allowStreamCopy,
        );

        $lastError = '';
        $exported = false;
        foreach ($exportAttempts as $cmd) {
            @unlink($outAbs);
            $export = Process::timeout(300)->run($cmd);
            if ($export->successful() && is_file($outAbs) && filesize($outAbs) >= 32) {
                $exported = true;
                break;
            }
            $lastError = $this->shortError($export->errorOutput().$export->output());
            @unlink($outAbs);
        }

        if (! $exported) {
            throw new RuntimeException('Video export failed: '.$lastError);
        }

        try {
            $posterVf = $aspect === 'original'
                ? sprintf('scale=%d:%d,format=yuv420p,setsar=1', max(2, $srcW & ~1), max(2, $srcH & ~1))
                : sprintf('crop=%d:%d:%d:%d,scale=%d:%d,format=yuv420p,setsar=1', $ew, $eh, $ex, $ey, $ew, $eh);

            $ff = $this->bin('ffmpeg');
            $poster = Process::timeout(90)->run([
                $ff, '-y', '-hide_banner', '-loglevel', 'error',
                '-noautorotate',
                '-ss', $this->fmtTime($posterAt),
                '-i', $sourceAbsolute,
                '-frames:v', '1',
                '-q:v', '3',
                '-vf', $posterVf,
                $posterAbs,
            ]);

            if (! $poster->successful() || ! is_file($posterAbs)) {
                // Fallback poster: same rotation handling as primary (-noautorotate).
                $poster = Process::timeout(90)->run([
                    $ff, '-y', '-hide_banner', '-loglevel', 'error',
                    '-noautorotate',
                    '-ss', $this->fmtTime($posterAt),
                    '-i', $sourceAbsolute,
                    '-frames:v', '1',
                    '-q:v', '3',
                    $posterAbs,
                ]);
            }

            if (! $poster->successful() || ! is_file($posterAbs)) {
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
        } catch (\Throwable $e) {
            @unlink($outAbs);
            @unlink($posterAbs);
            throw $e;
        }
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
            $this->bin('ffprobe'), '-v', 'quiet', '-print_format', 'json',
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

        $width = (int) ($video['width'] ?? 0);
        $height = (int) ($video['height'] ?? 0);
        if ($width < 2) {
            $width = (int) ($video['coded_width'] ?? 0);
        }
        if ($height < 2) {
            $height = (int) ($video['coded_height'] ?? 0);
        }

        return [
            'duration' => max(0, (float) ($data['format']['duration'] ?? ($video['duration'] ?? 0))),
            'width' => max(0, $width),
            'height' => max(0, $height),
            'codec' => (string) ($video['codec_name'] ?? ''),
        ];
    }

    /**
     * Ordered encode strategies for FFmpeg 4.4 + iPhone .mov quirks.
     * First success wins — stream-copy avoids libx264 init failures entirely.
     *
     * @return list<list<string>>
     */
    private function buildExportAttempts(
        string $src,
        string $out,
        string $ss,
        string $td,
        string $aspect,
        int $ex,
        int $ey,
        int $ew,
        int $eh,
        int $srcW,
        int $srcH,
        bool $allowStreamCopy = false,
    ): array {
        $ff = $this->bin('ffmpeg');
        $head = [$ff, '-y', '-hide_banner', '-loglevel', 'error'];

        // Avoid -profile/-level — FFmpeg 4.4 + some iPhone fps/size combos reject level 4.0.
        $encodeTail = [
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-threads', '1',
            '-movflags', '+faststart',
            '-an',
            $out,
        ];

        $attempts = [];

        if ($aspect === 'original') {
            // Stream-copy only when source is already H.264 mp4 AND no trim is requested.
            // Otherwise copy preserves HEVC and keyframe-aligns trim inaccurately.
            if ($allowStreamCopy) {
                $attempts[] = array_merge($head, [
                    '-noautorotate', '-ss', $ss, '-t', $td, '-i', $src,
                    '-c:v', 'copy', '-an', '-movflags', '+faststart', $out,
                ]);
                $attempts[] = array_merge($head, [
                    '-ss', $ss, '-t', $td, '-i', $src,
                    '-c:v', 'copy', '-an', '-movflags', '+faststart', $out,
                ]);
            }

            // 1) Reencode, no filters
            $attempts[] = array_merge($head, ['-ss', $ss, '-t', $td, '-i', $src], $encodeTail);

            // 2) Force CFR 30 + pix_fmt only
            $attempts[] = array_merge($head, [
                '-noautorotate', '-i', $src, '-ss', $ss, '-t', $td,
                '-vf', 'format=yuv420p',
                '-vsync', 'cfr', '-r', '30',
            ], $encodeTail);

            // 3) Explicit even size
            $attempts[] = array_merge($head, [
                '-noautorotate', '-ss', $ss, '-t', $td, '-i', $src,
                '-vf', sprintf('scale=%d:%d:flags=bicubic,format=yuv420p,setsar=1', $srcW, $srcH),
                '-vsync', 'cfr', '-r', '30',
            ], $encodeTail);

            // 4) Pad to even (expression form)
            $attempts[] = array_merge($head, [
                '-noautorotate', '-ss', $ss, '-t', $td, '-i', $src,
                '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2:(ow-iw)/2:(oh-ih)/2,format=yuv420p,setsar=1',
            ], $encodeTail);

            // 5) trim filter (when -ss/-t confuse timebase → 0 fps)
            $attempts[] = array_merge($head, [
                '-noautorotate', '-i', $src,
                '-vf', sprintf(
                    'trim=start=%s:duration=%s,setpts=PTS-STARTPTS,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
                    $ss,
                    $td,
                ),
                '-vsync', 'cfr', '-r', '30',
            ], $encodeTail);

            // 6) Downscale long edge (last resort)
            $long = max($srcW, $srcH);
            if ($long > 720) {
                $attempts[] = array_merge($head, [
                    '-noautorotate', '-ss', $ss, '-t', $td, '-i', $src,
                    '-vf', 'scale=trunc(iw*min(720/iw\\,720/ih)/2)*2:trunc(ih*min(720/iw\\,720/ih)/2)*2,format=yuv420p,setsar=1',
                    '-vsync', 'cfr', '-r', '30',
                ], $encodeTail);
            }
        } else {
            $cropVf = sprintf(
                'crop=%d:%d:%d:%d,scale=%d:%d:flags=bicubic,format=yuv420p,setsar=1',
                $ew, $eh, $ex, $ey, $ew, $eh,
            );
            $trimCropVf = sprintf(
                'trim=start=%s:duration=%s,setpts=PTS-STARTPTS,%s',
                $ss, $td, sprintf('crop=%d:%d:%d:%d,format=yuv420p,setsar=1', $ew, $eh, $ex, $ey),
            );

            $attempts[] = array_merge($head, [
                '-noautorotate', '-ss', $ss, '-t', $td, '-i', $src,
                '-vf', $cropVf, '-vsync', 'cfr', '-r', '30',
            ], $encodeTail);

            $attempts[] = array_merge($head, [
                '-noautorotate', '-i', $src, '-ss', $ss, '-t', $td,
                '-vf', $cropVf,
            ], $encodeTail);

            $attempts[] = array_merge($head, [
                '-ss', $ss, '-t', $td, '-i', $src,
                '-vf', $cropVf, '-vsync', 'cfr', '-r', '30',
            ], $encodeTail);

            $attempts[] = array_merge($head, [
                '-noautorotate', '-i', $src,
                '-vf', $trimCropVf, '-vsync', 'cfr', '-r', '30',
            ], $encodeTail);
        }

        return $attempts;
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

    private function relativeFromAbsolute(string $absolutePath): string
    {
        $root = Storage::disk('public')->path('');
        $root = rtrim(str_replace('\\', '/', $root), '/').'/';
        $normalized = str_replace('\\', '/', $absolutePath);
        if (str_starts_with($normalized, $root)) {
            return ltrim(substr($normalized, strlen($root)), '/');
        }

        $realRoot = realpath(Storage::disk('public')->path('')) ?: '';
        $realFile = realpath($absolutePath) ?: '';
        if ($realRoot !== '' && $realFile !== '' && str_starts_with($realFile, rtrim($realRoot, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR)) {
            return ltrim(str_replace('\\', '/', substr($realFile, strlen(rtrim($realRoot, DIRECTORY_SEPARATOR)))), '/');
        }

        throw new RuntimeException('Video path is not under the public disk.');
    }

    private function discardStoredVideo(string $absolutePath, string $relativePath): void
    {
        @unlink($absolutePath);
        $this->forgetMediaPath($relativePath);
    }

    private function forgetMediaPath(string $relativePath): void
    {
        $relativePath = ltrim($relativePath, '/');
        if ($relativePath === '') {
            return;
        }
        try {
            if (! Schema::hasTable('media_assets')) {
                return;
            }
            Media::query()->where('path', $relativePath)->delete();
        } catch (\Throwable) {
            // Catalog cleanup is best-effort.
        }
    }

    private function remapMediaPath(string $oldRel, string $newRel, string $mime, int $fileSize): void
    {
        $oldRel = ltrim($oldRel, '/');
        $newRel = ltrim($newRel, '/');
        if ($oldRel === '' || $newRel === '' || $oldRel === $newRel) {
            return;
        }
        try {
            if (! Schema::hasTable('media_assets')) {
                return;
            }
            Media::query()->where('path', $oldRel)->update([
                'path' => $newRel,
                'mime_type' => $mime,
                'file_size' => $fileSize,
            ]);
        } catch (\Throwable) {
            // Catalog remap is best-effort.
        }
    }
}
