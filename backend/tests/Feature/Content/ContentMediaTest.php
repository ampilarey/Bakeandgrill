<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContentMediaTest extends TestCase
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
            'name' => 'Media Content',
            'email' => 'content-media@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);
    }

    private function jpegAt(int $w, int $h): UploadedFile
    {
        $img = imagecreatetruecolor($w, $h);
        $white = imagecolorallocate($img, 240, 240, 240);
        imagefilledrectangle($img, 0, 0, $w, $h, $white);
        $tmp = tempnam(sys_get_temp_dir(), 'cmedia');
        imagejpeg($img, $tmp, 80);
        imagedestroy($img);

        return new UploadedFile($tmp, 'logo.jpg', 'image/jpeg', null, true);
    }

    public function test_scoped_upload_crops_and_persists(): void
    {
        $this->actingAsOwner();

        $res = $this->post('/api/admin/content/upload', [
            'key' => 'logo',
            'scope' => 'shared',
            'file' => $this->jpegAt(800, 600),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->json();

        $this->assertStringStartsWith('/storage/', $res['url']);
        $this->assertStringStartsWith('/storage/', $res['thumb_url']);
        $this->assertSame($res['url'], SiteSetting::get('logo'));

        $rel = ltrim(substr($res['url'], strlen('/storage/')), '/');
        $this->assertFileExists(storage_path('app/public/' . $rel));
        @unlink(storage_path('app/public/' . $rel));
        $trel = ltrim(substr($res['thumb_url'], strlen('/storage/')), '/');
        @unlink(storage_path('app/public/' . $trel));
    }

    public function test_hero_json_embed_upload_returns_url_without_wiping_json(): void
    {
        $this->actingAsOwner();

        SiteSetting::set('hero_slide_1', json_encode([
            'image' => '/old.jpg',
            'title' => 'Keep me',
        ]), 'website');

        $res = $this->post('/api/admin/content/upload', [
            'key' => 'hero_slide_1',
            'scope' => 'website',
            'file' => $this->jpegAt(800, 600),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->json();

        $this->assertTrue($res['embed'] ?? false);
        $this->assertStringStartsWith('/storage/', $res['url']);

        $stored = SiteSetting::getScoped('hero_slide_1', 'website');
        $this->assertStringContainsString('Keep me', (string) $stored);
        $this->assertStringNotContainsString($res['url'], (string) $stored);

        $rel = ltrim(substr($res['url'], strlen('/storage/')), '/');
        @unlink(storage_path('app/public/' . $rel));
        $trel = ltrim(substr($res['thumb_url'], strlen('/storage/')), '/');
        @unlink(storage_path('app/public/' . $trel));
    }
}
