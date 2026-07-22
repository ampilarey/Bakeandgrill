<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\ItemPhoto;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ItemVideoUploadTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsOwner(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $user = User::create([
            'name' => 'Video Owner',
            'email' => 'video-owner@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);
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

    private function fakeMp4(int $kilobytes = 100): UploadedFile
    {
        return UploadedFile::fake()->create('clip.mp4', $kilobytes, 'video/mp4');
    }

    public function test_accepts_mp4_with_poster(): void
    {
        $this->actingAsOwner();
        $item = Item::factory()->create();

        $photo = $this->post("/api/items/{$item->id}/photos", [
            'media_type' => 'video',
            'video' => $this->fakeMp4(200),
            'poster' => $this->tinyJpeg(),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->json('photo');

        $this->assertSame('video', $photo['media_type']);
        $this->assertNotEmpty($photo['poster_url']);
        $this->assertStringContainsString('/video/', $photo['url']);
        $this->assertFileExists(storage_path('app/public/'.ltrim(substr($photo['url'], strlen('/storage/')), '/')));
        $this->assertFileExists(storage_path('app/public/'.ltrim(substr($photo['poster_url'], strlen('/storage/')), '/')));
    }

    public function test_requires_poster(): void
    {
        $this->actingAsOwner();
        $item = Item::factory()->create();

        $this->post("/api/items/{$item->id}/photos", [
            'media_type' => 'video',
            'video' => $this->fakeMp4(100),
        ], ['Accept' => 'application/json'])
            ->assertStatus(422);
    }

    public function test_rejects_oversize_video(): void
    {
        $this->actingAsOwner();
        config(['menu_media.video.max_kb' => 100]);
        $item = Item::factory()->create();

        $this->post("/api/items/{$item->id}/photos", [
            'media_type' => 'video',
            'video' => $this->fakeMp4(500),
            'poster' => $this->tinyJpeg(),
        ], ['Accept' => 'application/json'])
            ->assertStatus(422);
    }

    public function test_deleting_video_removes_video_and_poster_files(): void
    {
        $this->actingAsOwner();
        $item = Item::factory()->create();

        $photo = $this->post("/api/items/{$item->id}/photos", [
            'media_type' => 'video',
            'video' => $this->fakeMp4(50),
            'poster' => $this->tinyJpeg(),
        ], ['Accept' => 'application/json'])->json('photo');

        $videoRel = ltrim(substr($photo['url'], strlen('/storage/')), '/');
        $posterRel = ltrim(substr($photo['poster_url'], strlen('/storage/')), '/');
        $this->assertFileExists(storage_path('app/public/'.$videoRel));
        $this->assertFileExists(storage_path('app/public/'.$posterRel));

        ItemPhoto::findOrFail($photo['id'])->delete();

        $this->assertFileDoesNotExist(storage_path('app/public/'.$videoRel));
        $this->assertFileDoesNotExist(storage_path('app/public/'.$posterRel));
    }
}
