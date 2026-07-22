<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\User;
use App\Support\ImageCapabilities;
use App\Support\MenuImageValidation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ImageUploadLimitsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    private function actingAsOwner(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $user = User::create([
            'name' => 'Upload Owner',
            'email' => 'upload-owner@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);
    }

    /** Build a real JPEG at exact pixel dimensions (small quality for speed). */
    private function jpegAt(int $width, int $height, string $name = 'big.jpg'): UploadedFile
    {
        $img = imagecreatetruecolor($width, $height);
        $this->assertNotFalse($img);
        $white = imagecolorallocate($img, 255, 255, 255);
        imagefilledrectangle($img, 0, 0, $width, $height, $white);
        $tmp = tempnam(sys_get_temp_dir(), 'img');
        imagejpeg($img, $tmp, 50);
        imagedestroy($img);

        return new UploadedFile($tmp, $name, 'image/jpeg', null, true);
    }

    public function test_oversized_edge_is_rejected_with_422(): void
    {
        $this->actingAsOwner();
        config(['menu_media.image.max_edge' => 5000]);

        $file = $this->jpegAt(5100, 100);

        $this->post('/api/admin/upload-image', [
            'image' => $file,
        ], ['Accept' => 'application/json'])
            ->assertStatus(422);
    }

    public function test_oversized_megapixels_rejected_before_decode_path(): void
    {
        $this->actingAsOwner();
        // Allow a large edge so the megapixel guard is what fires.
        config([
            'menu_media.image.max_edge' => 8000,
            'menu_media.image.max_megapixels' => 1,
        ]);

        // 1500×1500 = 2.25 MP > 1 MP
        $file = $this->jpegAt(1500, 1500);

        $response = $this->post('/api/admin/upload-image', [
            'image' => $file,
        ], ['Accept' => 'application/json']);

        $response->assertStatus(422);
        $this->assertStringContainsString('megapixel', strtolower($response->json('message') ?? $response->getContent()));
    }

    public function test_valid_small_jpeg_uploads(): void
    {
        $this->actingAsOwner();

        $file = $this->jpegAt(800, 600);

        $this->post('/api/admin/upload-image', [
            'image' => $file,
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonStructure(['url', 'original_url', 'width', 'height']);
    }

    public function test_webp_mimes_excluded_when_unsupported(): void
    {
        if (ImageCapabilities::supportsWebp()) {
            $this->assertContains('webp', MenuImageValidation::allowedMimes());
            $this->markTestSkipped('GD supports WebP on this runtime — exclusion path not exercised.');
        }

        $this->assertNotContains('webp', MenuImageValidation::allowedMimes());
        $this->assertSame(
            "WebP isn't supported on this server; upload JPEG or PNG.",
            MenuImageValidation::webpUnsupportedMessage(),
        );
    }

    public function test_config_exposes_expected_defaults(): void
    {
        $this->assertSame(5000, (int) config('menu_media.image.max_edge'));
        $this->assertSame(25, (int) config('menu_media.image.max_megapixels'));
        $this->assertSame(8192, (int) config('menu_media.video.max_kb'));
    }
}
