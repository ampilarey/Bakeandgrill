<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Domains\Media\Services\MediaLibraryService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\Media;
use App\Models\Role;
use App\Models\User;
use App\Services\MenuImageProcessor;
use App\Support\MenuImageValidation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class IphoneMediaUploadTest extends TestCase
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
            'name' => 'iPhone Owner',
            'email' => 'iphone-owner@test.local',
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
        $tmp = tempnam(sys_get_temp_dir(), 'poster');
        imagejpeg($img, $tmp, 80);
        imagedestroy($img);

        return new UploadedFile($tmp, 'poster.jpg', 'image/jpeg', null, true);
    }

    private function fakeMov(int $kilobytes = 100): UploadedFile
    {
        return UploadedFile::fake()->create('clip.mov', $kilobytes, 'video/quicktime');
    }

    private function fakeMp4(int $kilobytes = 100): UploadedFile
    {
        return UploadedFile::fake()->create('clip.mp4', $kilobytes, 'video/mp4');
    }

    public function test_gallery_accepts_mov_video(): void
    {
        $this->actingAsOwner();
        $item = Item::factory()->create();

        $photo = $this->post("/api/items/{$item->id}/photos", [
            'media_type' => 'video',
            'video' => $this->fakeMov(200),
            'poster' => $this->tinyJpeg(),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->json('photo');

        $this->assertSame('video', $photo['media_type']);
        $this->assertStringContainsString('.mov', $photo['url']);
    }

    public function test_gallery_still_accepts_mp4(): void
    {
        $this->actingAsOwner();
        $item = Item::factory()->create();

        $this->post("/api/items/{$item->id}/photos", [
            'media_type' => 'video',
            'video' => $this->fakeMp4(100),
            'poster' => $this->tinyJpeg(),
        ], ['Accept' => 'application/json'])
            ->assertCreated();
    }

    public function test_gallery_rejects_unrelated_video_type(): void
    {
        $this->actingAsOwner();
        $item = Item::factory()->create();

        $this->post("/api/items/{$item->id}/photos", [
            'media_type' => 'video',
            'video' => UploadedFile::fake()->create('clip.avi', 100, 'video/x-msvideo'),
            'poster' => $this->tinyJpeg(),
        ], ['Accept' => 'application/json'])
            ->assertStatus(422);
    }

    public function test_content_upload_video_accepts_mov(): void
    {
        $this->actingAsOwner();

        $res = $this->post('/api/admin/content/upload-video', [
            'key' => 'hero_slides',
            'scope' => 'order_app',
            'video' => $this->fakeMov(150),
            'poster' => $this->tinyJpeg(),
        ], ['Accept' => 'application/json']);

        $res->assertCreated();
        $this->assertStringContainsString('.mov', $res->json('url'));
    }

    public function test_media_library_accepts_mov_without_crashing(): void
    {
        $owner = $this->actingAsOwner();
        $library = app(MediaLibraryService::class);

        $result = $library->storeUpload($this->fakeMov(80), $owner);
        $asset = $result['asset'];

        $this->assertSame('video', $asset->media_type);
        $this->assertStringContainsString('video/quicktime', (string) $asset->mime_type);
        $this->assertNotEmpty($asset->thumb_url);
        $this->assertSame('video', $library->mediaTypeFromMime('video/quicktime'));
    }

    public function test_heic_rejected_with_specific_message(): void
    {
        $this->actingAsOwner();
        $heic = UploadedFile::fake()->create('photo.heic', 200, 'image/heic');

        $res = $this->post('/api/admin/upload-image', [
            'image' => $heic,
        ], ['Accept' => 'application/json']);

        $res->assertStatus(422);
        $expected = MenuImageValidation::heicRejectedMessage();
        $errors = $res->json('errors.image') ?? [];
        $combined = strtolower(($res->json('message') ?? '') . ' ' . json_encode($errors));
        $this->assertTrue(
            in_array($expected, $errors, true) || str_contains($combined, 'heic'),
            'Expected HEIC-specific rejection, got: ' . $combined,
        );
        $this->assertTrue(MenuImageValidation::looksLikeHeic($heic));
    }

    public function test_exif_orientation_6_comes_out_upright(): void
    {
        if (!function_exists('exif_read_data')) {
            $this->markTestSkipped('exif extension not available');
        }

        // Build a landscape 200×100 JPEG, then embed Orientation=6 (90° CW).
        $img = imagecreatetruecolor(200, 100);
        $this->assertNotFalse($img);
        $red = imagecolorallocate($img, 220, 40, 40);
        $blue = imagecolorallocate($img, 40, 40, 220);
        imagefilledrectangle($img, 0, 0, 99, 99, $red);
        imagefilledrectangle($img, 100, 0, 199, 99, $blue);
        $tmp = tempnam(sys_get_temp_dir(), 'exif') . '.jpg';
        imagejpeg($img, $tmp, 90);
        imagedestroy($img);

        $this->injectExifOrientation($tmp, 6);

        $upload = new UploadedFile($tmp, 'portrait.jpg', 'image/jpeg', null, true);
        $processor = app(MenuImageProcessor::class);
        $binary = $processor->processMasterJpeg($upload);

        $out = imagecreatefromstring($binary);
        $this->assertNotFalse($out);
        $w = imagesx($out);
        $h = imagesy($out);
        // Orientation 6 rotates 90° CW → original 200×100 becomes 100×200.
        $this->assertSame(100, $w);
        $this->assertSame(200, $h);
        imagedestroy($out);
        @unlink($tmp);
    }

    /**
     * Minimal EXIF Orientation injection via piexif-less approach:
     * rewrite a tiny APP1 segment. Falls back to skipping if unavailable.
     */
    private function injectExifOrientation(string $path, int $orientation): void
    {
        // Use Imagick if present; otherwise write a known-good JPEG with EXIF via GD+manual APP1.
        if (extension_loaded('imagick') && class_exists(\Imagick::class)) {
            $im = new \Imagick($path);
            $im->setImageOrientation($orientation);
            $im->writeImage($path);
            $im->clear();

            return;
        }

        // Manual APP1 with Orientation tag (IFD0 tag 0x0112).
        $jpeg = (string) file_get_contents($path);
        if (!str_starts_with($jpeg, "\xFF\xD8")) {
            $this->markTestSkipped('Not a JPEG');
        }

        // TIFF header little-endian, one IFD entry: Orientation = SHORT
        $tiff = "II\x2A\x00\x08\x00\x00\x00" // II, 42, IFD0 offset 8
            . "\x01\x00" // 1 entry
            . "\x12\x01\x03\x00\x01\x00\x00\x00" // tag 0x0112, type SHORT, count 1
            . pack('v', $orientation) . "\x00\x00" // value
            . "\x00\x00\x00\x00"; // next IFD

        $exifPayload = "Exif\x00\x00" . $tiff;
        $app1 = "\xFF\xE1" . pack('n', strlen($exifPayload) + 2) . $exifPayload;

        // Insert APP1 after SOI
        $out = "\xFF\xD8" . $app1 . substr($jpeg, 2);
        file_put_contents($path, $out);

        $read = @exif_read_data($path);
        if ($read === false || (int) ($read['Orientation'] ?? 0) !== $orientation) {
            $this->markTestSkipped('Could not embed readable EXIF Orientation on this runtime');
        }
    }
}
