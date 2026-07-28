<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Domains\Media\Services\MediaLibraryService;
use App\Domains\Media\Services\VideoProcessor;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\Media;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class VideoPipelineTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
    }

    private function actingAsOwner(): User
    {
        $user = User::create([
            'name' => 'Pipeline Owner',
            'email' => 'pipeline-owner@test.local',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);

        return $user;
    }

    private function tinyJpeg(): UploadedFile
    {
        $img = imagecreatetruecolor(320, 240);
        $this->assertNotFalse($img);
        imagefilledrectangle($img, 0, 0, 320, 240, imagecolorallocate($img, 200, 100, 50));
        $tmp = tempnam(sys_get_temp_dir(), 'poster').'.jpg';
        imagejpeg($img, $tmp, 80);
        imagedestroy($img);

        return new UploadedFile($tmp, 'poster.jpg', 'image/jpeg', null, true);
    }

    private function requireFfmpeg(): VideoProcessor
    {
        $processor = app(VideoProcessor::class);
        if (! $processor->available()) {
            $this->markTestSkipped('FFmpeg not available in this environment');
        }

        return $processor;
    }

    private function generateH264Mp4(string $absolutePath, float $duration = 2.0): void
    {
        $dir = dirname($absolutePath);
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $gen = proc_open(
            [
                'ffmpeg', '-y',
                '-f', 'lavfi', '-i', 'color=c=orange:s=320x240:d='.$duration,
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                '-an',
                $absolutePath,
            ],
            [2 => ['pipe', 'w']],
            $pipes,
        );
        if (is_resource($gen)) {
            stream_get_contents($pipes[2]);
            fclose($pipes[2]);
            proc_close($gen);
        }
        if (! is_file($absolutePath)) {
            $this->markTestSkipped('Could not generate H.264 test mp4');
        }
    }

    private function generateHevcMov(string $absolutePath, float $duration = 1.5): void
    {
        $dir = dirname($absolutePath);
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $attempts = [
            ['ffmpeg', '-y', '-f', 'lavfi', '-i', 'color=c=green:s=320x240:d='.$duration, '-c:v', 'libx265', '-tag:v', 'hvc1', '-an', $absolutePath],
            ['ffmpeg', '-y', '-f', 'lavfi', '-i', 'color=c=green:s=320x240:d='.$duration, '-c:v', 'hevc_videotoolbox', '-tag:v', 'hvc1', '-an', $absolutePath],
        ];

        foreach ($attempts as $cmd) {
            $gen = proc_open($cmd, [2 => ['pipe', 'w']], $pipes);
            if (is_resource($gen)) {
                stream_get_contents($pipes[2]);
                fclose($pipes[2]);
                proc_close($gen);
            }
            if (is_file($absolutePath) && filesize($absolutePath) > 32) {
                $probe = app(VideoProcessor::class)->probe($absolutePath);
                if (in_array(strtolower($probe['codec']), ['hevc', 'h265'], true)) {
                    return;
                }
            }
            @unlink($absolutePath);
        }

        $this->markTestSkipped('Could not generate HEVC .mov (no libx265 / hevc_videotoolbox)');
    }

    private function uploadedFromPath(string $absolutePath, string $clientName, string $mime): UploadedFile
    {
        return new UploadedFile($absolutePath, $clientName, $mime, null, true);
    }

    public function test_h264_mp4_upload_is_byte_identical_fast_path(): void
    {
        $processor = $this->requireFfmpeg();
        $tmp = storage_path('framework/testing/'.uniqid('h264_', true).'.mp4');
        $this->generateH264Mp4($tmp, 1.0);
        $before = (string) file_get_contents($tmp);

        Storage::disk('public')->makeDirectory('library/video');
        $rel = 'library/video/fast-path-src.mp4';
        Storage::disk('public')->put($rel, $before);
        $abs = Storage::disk('public')->path($rel);

        $result = $processor->ensureWebSafe($abs);

        $this->assertFalse($result['converted']);
        $this->assertSame('mp4', $result['extension']);
        $this->assertSame('video/mp4', $result['mime']);
        $this->assertSame('h264', $result['codec']);
        $this->assertSame($before, (string) file_get_contents($result['absolute_path']));
        @unlink($tmp);
    }

    public function test_hevc_mov_is_converted_to_h264_mp4(): void
    {
        $processor = $this->requireFfmpeg();
        $tmp = storage_path('framework/testing/'.uniqid('hevc_', true).'.mov');
        $this->generateHevcMov($tmp);

        Storage::disk('public')->makeDirectory('library/video');
        $rel = 'library/video/iphone-src.mov';
        Storage::disk('public')->put($rel, (string) file_get_contents($tmp));
        $abs = Storage::disk('public')->path($rel);

        $result = $processor->ensureWebSafe($abs);

        $this->assertTrue($result['converted']);
        $this->assertSame('mp4', $result['extension']);
        $this->assertSame('video/mp4', $result['mime']);
        $this->assertSame('h264', $result['codec']);
        $this->assertStringEndsWith('.mp4', $result['relative_path']);
        $this->assertFileDoesNotExist($abs);
        $this->assertFileExists($result['absolute_path']);
        @unlink($tmp);
    }

    public function test_mov_rejected_when_ffmpeg_unavailable_stores_nothing(): void
    {
        $owner = $this->actingAsOwner();
        config(['media.ffmpeg_disabled' => true]);

        $upload = UploadedFile::fake()->create('clip.mov', 80, 'video/quicktime');

        $beforeCount = Media::query()->count();
        $beforeFiles = Storage::disk('public')->allFiles('library/video');

        try {
            app(MediaLibraryService::class)->storeUpload($upload, $owner);
            $this->fail('Expected 422 for .mov without FFmpeg');
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertSame(VideoProcessor::WEB_UNSAFE_MESSAGE, $e->getMessage());
        }

        $this->assertSame($beforeCount, Media::query()->count());
        $this->assertSame($beforeFiles, Storage::disk('public')->allFiles('library/video'));
    }

    public function test_menu_item_video_path_normalises_mov(): void
    {
        $this->requireFfmpeg();
        $this->actingAsOwner();
        $item = Item::factory()->create();

        $tmp = storage_path('framework/testing/'.uniqid('item_hevc_', true).'.mov');
        $this->generateHevcMov($tmp);

        $photo = $this->post("/api/items/{$item->id}/photos", [
            'media_type' => 'video',
            'video' => $this->uploadedFromPath($tmp, 'clip.mov', 'video/quicktime'),
            'poster' => $this->tinyJpeg(),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->json('photo');

        $this->assertStringEndsWith('.mp4', (string) $photo['url']);
        $rel = ltrim(substr((string) $photo['url'], strlen('/storage/')), '/');
        $abs = Storage::disk('public')->path($rel);
        $this->assertFileExists($abs);
        $meta = app(VideoProcessor::class)->probe($abs);
        $this->assertSame('h264', strtolower($meta['codec']));
    }

    public function test_hero_video_path_normalises_mov(): void
    {
        $this->requireFfmpeg();
        $this->actingAsOwner();

        $tmp = storage_path('framework/testing/'.uniqid('hero_hevc_', true).'.mov');
        $this->generateHevcMov($tmp);

        $res = $this->post('/api/admin/content/upload-video', [
            'key' => 'hero_slides',
            'scope' => 'order_app',
            'video' => $this->uploadedFromPath($tmp, 'hero.mov', 'video/quicktime'),
            'poster' => $this->tinyJpeg(),
        ], ['Accept' => 'application/json']);

        $res->assertCreated();
        $url = (string) $res->json('url');
        $this->assertStringEndsWith('.mp4', $url);
        $rel = ltrim(substr($url, strlen('/storage/')), '/');
        $meta = app(VideoProcessor::class)->probe(Storage::disk('public')->path($rel));
        $this->assertSame('h264', strtolower($meta['codec']));
    }

    public function test_media_library_path_normalises_mov(): void
    {
        $this->requireFfmpeg();
        $owner = $this->actingAsOwner();

        $tmp = storage_path('framework/testing/'.uniqid('lib_hevc_', true).'.mov');
        $this->generateHevcMov($tmp);

        $result = app(MediaLibraryService::class)->storeUpload(
            $this->uploadedFromPath($tmp, 'lib.mov', 'video/quicktime'),
            $owner,
        );
        $asset = $result['asset'];

        $this->assertSame('video/mp4', $asset->mime_type);
        $this->assertStringEndsWith('.mp4', $asset->path);
        $meta = app(VideoProcessor::class)->probe(Storage::disk('public')->path($asset->path));
        $this->assertSame('h264', strtolower($meta['codec']));
    }

    public function test_studio_trim_with_original_aspect_reencodes_to_h264(): void
    {
        $processor = $this->requireFfmpeg();
        $this->actingAsOwner();

        Storage::disk('public')->makeDirectory('library/video');
        $rel = 'library/video/studio-trim-src.mp4';
        $abs = Storage::disk('public')->path($rel);
        $this->generateH264Mp4($abs, 2.0);

        $res = $this->postJson('/api/admin/media/video/process', [
            'source_url' => '/storage/'.$rel,
            'trim_start' => 0.25,
            'trim_end' => 1.25,
            'aspect' => 'original',
            'poster_at' => 0.5,
            'register_library' => false,
        ]);

        $res->assertCreated();
        $outRel = ltrim(substr((string) $res->json('url'), strlen('/storage/')), '/');
        $outAbs = Storage::disk('public')->path($outRel);
        $meta = $processor->probe($outAbs);
        $this->assertSame('h264', strtolower($meta['codec']));
        $this->assertEqualsWithDelta(1.0, $meta['duration'], 0.3);
    }

    public function test_studio_h264_mp4_without_trim_still_stream_copies(): void
    {
        $processor = $this->requireFfmpeg();
        $this->actingAsOwner();

        Storage::disk('public')->makeDirectory('library/video');
        $rel = 'library/video/studio-copy-src.mp4';
        $abs = Storage::disk('public')->path($rel);
        $this->generateH264Mp4($abs, 1.5);
        $before = (string) file_get_contents($abs);

        $res = $this->postJson('/api/admin/media/video/process', [
            'source_url' => '/storage/'.$rel,
            'trim_start' => 0,
            'trim_end' => 1.5,
            'aspect' => 'original',
            'poster_at' => 0.2,
            'register_library' => false,
        ]);

        $res->assertCreated();
        $outRel = ltrim(substr((string) $res->json('url'), strlen('/storage/')), '/');
        $outAbs = Storage::disk('public')->path($outRel);
        $meta = $processor->probe($outAbs);
        $this->assertSame('h264', strtolower($meta['codec']));
        $this->assertEqualsWithDelta(1.5, $meta['duration'], 0.3);
        $this->assertGreaterThan((int) (strlen($before) * 0.5), filesize($outAbs));
    }

    public function test_poster_fallback_uses_noautorotate(): void
    {
        $processor = $this->requireFfmpeg();

        Storage::disk('public')->makeDirectory('library/video');
        $rel = 'library/video/poster-rot-src.mp4';
        $abs = Storage::disk('public')->path($rel);

        $gen = proc_open(
            [
                'ffmpeg', '-y',
                '-f', 'lavfi', '-i', 'color=c=blue:s=640x360:d=1',
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                '-metadata:s:v:0', 'rotate=90',
                '-an',
                $abs,
            ],
            [2 => ['pipe', 'w']],
            $pipes,
        );
        if (is_resource($gen)) {
            stream_get_contents($pipes[2]);
            fclose($pipes[2]);
            proc_close($gen);
        }
        if (! is_file($abs)) {
            $this->markTestSkipped('Could not generate rotated source');
        }

        $out = $processor->process($abs, [
            'trim_start' => 0,
            'trim_end' => 0.8,
            'aspect' => 'original',
            'poster_at' => 0.1,
        ]);

        $posterAbs = Storage::disk('public')->path($out['poster_path']);
        $this->assertFileExists($posterAbs);
        $size = @getimagesize($posterAbs);
        $this->assertNotFalse($size);
        // With -noautorotate, poster matches coded landscape (W > H).
        $this->assertGreaterThan($size[1], $size[0]);
    }
}
