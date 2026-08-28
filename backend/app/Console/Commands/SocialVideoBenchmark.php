<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Media\Services\VideoProcessor;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Process;

/**
 * The hard gate for the social video renderer (plan, video section): run on
 * TEST before enabling renders anywhere. Measures real render time, output
 * size, temp-disk usage and cleanup for each format using synthetic photos,
 * so no item data is touched. Pass/fail guidance is printed at the end.
 */
class SocialVideoBenchmark extends Command
{
    protected $signature = 'social:video-benchmark {--keep : Keep the rendered files for inspection}';

    protected $description = 'Benchmark ffmpeg social-video rendering on this host (run on TEST before enabling)';

    private const FORMATS = [
        'vertical' => [720, 1280],
        'square' => [720, 720],
        'landscape' => [1280, 720],
    ];

    // Renders comfortably inside this wall time pass; beyond it the host is
    // too slow for queued rendering and the feature should stay off.
    private const PASS_SECONDS = 120;

    public function handle(VideoProcessor $video): int
    {
        if (!$video->available()) {
            $this->error('FAIL: ffmpeg/ffprobe not available (check media.ffmpeg_path in config/media.php).');

            return self::FAILURE;
        }
        $this->info('ffmpeg: ' . $video->ffmpegBinary());

        $dir = storage_path('app/social-video-benchmark');
        @mkdir($dir, 0775, true);
        $photos = $this->makeSamplePhotos($dir);

        $allPass = true;
        $outputs = [];
        foreach (self::FORMATS as $name => [$w, $h]) {
            $out = "{$dir}/bench-{$name}.mp4";
            $started = microtime(true);
            $result = $this->render($video, $photos, $w, $h, $out);
            $elapsed = microtime(true) - $started;

            if (!$result || !is_file($out)) {
                $this->error(sprintf('%-10s FAIL — render did not produce output', $name));
                $allPass = false;

                continue;
            }

            $bytes = (int) filesize($out);
            $pass = $elapsed <= self::PASS_SECONDS;
            $allPass = $allPass && $pass;
            $outputs[] = $out;
            $this->line(sprintf(
                '%-10s %s — %5.1fs wall, %s, %dx%d',
                $name,
                $pass ? 'PASS' : 'SLOW',
                $elapsed,
                $this->humanBytes($bytes),
                $w,
                $h,
            ));
        }

        $tempLeft = count(glob("{$dir}/tmp-*") ?: []);
        $this->line('Temp cleanup: ' . ($tempLeft === 0 ? 'clean' : "{$tempLeft} stray files — investigate"));

        if (!$this->option('keep')) {
            foreach ([...$outputs, ...$photos] as $file) {
                @unlink($file);
            }
            @rmdir($dir);
        } else {
            $this->info("Outputs kept in {$dir}");
        }

        if ($allPass) {
            $this->info('PASS — this host can render social videos inside the budget. The social queue worker will pick renders up.');

            return self::SUCCESS;
        }
        $this->error(sprintf(
            'FAIL/SLOW — renders exceeded %ds. Keep the video feature off on this host, or lower resolutions before retrying.',
            self::PASS_SECONDS,
        ));

        return self::FAILURE;
    }

    /** @return list<string> */
    private function makeSamplePhotos(string $dir): array
    {
        $paths = [];
        foreach ([[0xD4, 0x81, 0x3A], [0x1C, 0x64, 0x08], [0x08, 0x36, 0x64]] as $i => [$r, $g, $b]) {
            $img = imagecreatetruecolor(1600, 1200);
            $color = imagecolorallocate($img, $r, $g, $b);
            imagefilledrectangle($img, 0, 0, 1600, 1200, $color);
            // Texture so the encoder does representative work, not flat color.
            for ($n = 0; $n < 400; $n++) {
                $c = imagecolorallocate($img, random_int(0, 255), random_int(0, 255), random_int(0, 255));
                imagefilledellipse($img, random_int(0, 1600), random_int(0, 1200), random_int(20, 160), random_int(20, 160), $c);
            }
            $path = "{$dir}/sample-{$i}.jpg";
            imagejpeg($img, $path, 88);
            imagedestroy($img);
            $paths[] = $path;
        }

        return $paths;
    }

    /** @param list<string> $photos */
    private function render(VideoProcessor $video, array $photos, int $w, int $h, string $out): bool
    {
        $cmd = [$video->ffmpegBinary(), '-y'];
        foreach ($photos as $photo) {
            array_push($cmd, '-loop', '1', '-t', '3', '-i', $photo);
        }
        $filters = [];
        foreach ($photos as $i => $_) {
            $filters[] = sprintf(
                "[%d:v]scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,setsar=1,zoompan=z='min(zoom+0.0012,1.12)':d=75:s=%dx%d:fps=25[v%d]",
                $i,
                $w,
                $h,
                $w,
                $h,
                $w,
                $h,
                $i,
            );
        }
        $filters[] = '[v0][v1]xfade=transition=fade:duration=0.5:offset=2.5[x1]';
        $filters[] = '[x1][v2]xfade=transition=fade:duration=0.5:offset=5.0[vout]';
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
            $out,
        );

        return Process::timeout(600)->run($cmd)->successful();
    }

    private function humanBytes(int $bytes): string
    {
        return $bytes > 1048576
            ? sprintf('%.1f MB', $bytes / 1048576)
            : sprintf('%.0f KB', $bytes / 1024);
    }
}
