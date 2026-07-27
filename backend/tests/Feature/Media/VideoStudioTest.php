<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Domains\Media\Services\VideoProcessor;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class VideoStudioTest extends TestCase
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
            'name' => 'Video Studio Owner',
            'email' => 'video-studio-owner@test.local',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);

        return $user;
    }

    public function test_capabilities_reports_ffmpeg_flag(): void
    {
        $this->actingAsOwner();

        $res = $this->getJson('/api/admin/media/video/capabilities');
        $res->assertOk()
            ->assertJsonStructure(['ffmpeg', 'tools', 'aspects']);
        $this->assertContains('trim', $res->json('tools'));
    }

    public function test_process_exports_trimmed_muted_mp4_when_ffmpeg_available(): void
    {
        $processor = app(VideoProcessor::class);
        if (! $processor->available()) {
            $this->markTestSkipped('FFmpeg not available in this environment');
        }

        $this->actingAsOwner();

        Storage::disk('public')->makeDirectory('library/video');
        $rel = 'library/video/studio-src.mp4';
        $abs = Storage::disk('public')->path($rel);

        $gen = proc_open(
            [
                'ffmpeg', '-y',
                '-f', 'lavfi', '-i', 'color=c=orange:s=320x240:d=2',
                '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
                '-shortest',
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
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
            $this->markTestSkipped('Could not generate test mp4 with ffmpeg');
        }

        $res = $this->postJson('/api/admin/media/video/process', [
            'source_url' => '/storage/'.$rel,
            'trim_start' => 0.2,
            'trim_end' => 1.5,
            'aspect' => '1:1',
            'poster_at' => 0.5,
            'register_library' => false,
        ]);

        $res->assertCreated()
            ->assertJsonStructure(['url', 'poster_url', 'duration', 'width', 'height']);
        $this->assertStringContainsString('/storage/', (string) $res->json('url'));
        $this->assertStringContainsString('.mp4', (string) $res->json('url'));
        $this->assertStringContainsString('.jpg', (string) $res->json('poster_url'));
    }

    public function test_process_portrait_original_aspect_exports(): void
    {
        $processor = app(VideoProcessor::class);
        if (! $processor->available()) {
            $this->markTestSkipped('FFmpeg not available in this environment');
        }

        $this->actingAsOwner();

        Storage::disk('public')->makeDirectory('library/video');
        $rel = 'library/video/studio-portrait.mp4';
        $abs = Storage::disk('public')->path($rel);

        $gen = proc_open(
            [
                'ffmpeg', '-y',
                '-f', 'lavfi', '-i', 'color=c=blue:s=576x1024:d=2',
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
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
            $this->markTestSkipped('Could not generate portrait test mp4');
        }

        $this->postJson('/api/admin/media/video/process', [
            'source_url' => '/storage/'.$rel,
            'trim_start' => 0,
            'trim_end' => 1.5,
            'aspect' => 'original',
            'poster_at' => 0.3,
            'register_library' => false,
        ])->assertCreated();

        $this->postJson('/api/admin/media/video/process', [
            'source_url' => '/storage/'.$rel,
            'trim_start' => 0,
            'trim_end' => 1.5,
            'aspect' => '4:5',
            'poster_at' => 0.3,
            'register_library' => false,
        ])->assertCreated();
    }
}
