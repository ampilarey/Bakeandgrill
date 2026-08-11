<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Media;
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

    private function jpegAt(int $w, int $h, array $rgb = [240, 240, 240], string $name = 'logo.jpg'): UploadedFile
    {
        $img = imagecreatetruecolor($w, $h);
        $color = imagecolorallocate($img, (int) $rgb[0], (int) $rgb[1], (int) $rgb[2]);
        imagefilledrectangle($img, 0, 0, $w, $h, $color);
        $tmp = tempnam(sys_get_temp_dir(), 'cmedia');
        imagejpeg($img, $tmp, 80);
        imagedestroy($img);

        return new UploadedFile($tmp, $name, 'image/jpeg', null, true);
    }

    public function test_direct_image_upload_is_draft_safe_and_catalogued(): void
    {
        $this->actingAsOwner();
        SiteSetting::set('logo', '/storage/site/live-logo.jpg', 'shared', 'en');

        $res = $this->post('/api/admin/content/upload', [
            'key' => 'logo',
            'scope' => 'shared',
            'file' => $this->jpegAt(800, 600, [220, 80, 40], 'draft-logo.jpg'),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->json();

        $this->assertTrue($res['embed'] ?? false);
        $this->assertStringStartsWith('/storage/', $res['url']);
        $this->assertStringStartsWith('/storage/', $res['thumb_url']);
        $this->assertStringStartsWith('/storage/', $res['original_url']);
        $this->assertNotEmpty($res['media_id']);
        $this->assertSame('/storage/site/live-logo.jpg', SiteSetting::get('logo'));

        $public = $this->getJson('/api/content?app=website&locale=en')
            ->assertOk()
            ->json('content');
        $this->assertSame('/storage/site/live-logo.jpg', $public['logo'] ?? null);

        $media = Media::find($res['media_id']);
        $this->assertNotNull($media);
        $this->assertSame($res['url'], $media->url);
        $this->assertSame('content', $media->source);
        $this->assertSame($res['thumb_url'], $media->thumb_url);
        $this->assertSame($res['original_url'], $media->original_url);

        $library = $this->getJson('/api/admin/media?type=image&source=content')
            ->assertOk()
            ->json('data');
        $this->assertContains((int) $res['media_id'], array_map(static fn (array $asset): int => (int) $asset['id'], $library));

        foreach (['url', 'thumb_url', 'original_url', 'image_webp_url', 'thumb_webp_url'] as $field) {
            $this->deleteStorageUrl($res[$field] ?? null);
        }
    }

    public function test_publishing_uploaded_logo_url_changes_live_content(): void
    {
        $this->actingAsOwner();
        SiteSetting::set('logo', '/storage/site/live-before-publish.jpg', 'shared', 'en');

        $res = $this->post('/api/admin/content/upload', [
            'key' => 'logo',
            'scope' => 'shared',
            'file' => $this->jpegAt(800, 600, [40, 120, 220], 'publish-logo.jpg'),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->json();

        $this->assertSame('/storage/site/live-before-publish.jpg', SiteSetting::get('logo'));

        $this->putJson('/api/admin/content', [
            'locale' => 'en',
            'changes' => [
                ['key' => 'logo', 'scope' => 'shared', 'value' => $res['url']],
            ],
        ])->assertOk()->assertJsonPath('message', 'Content published.');

        $this->assertSame($res['url'], SiteSetting::get('logo'));
        $public = $this->getJson('/api/content?app=website&locale=en')
            ->assertOk()
            ->json('content');
        $this->assertSame($res['url'], $public['logo'] ?? null);

        foreach (['url', 'thumb_url', 'original_url', 'image_webp_url', 'thumb_webp_url'] as $field) {
            $this->deleteStorageUrl($res[$field] ?? null);
        }
    }

    public function test_hero_json_embed_upload_returns_url_without_wiping_json(): void
    {
        $this->actingAsOwner();

        SiteSetting::set('hero_slides', json_encode([
            [
                'image' => '/old.jpg',
                'title' => 'Keep me',
            ],
        ]), 'website');

        $res = $this->post('/api/admin/content/upload', [
            'key' => 'hero_slides',
            'scope' => 'website',
            'file' => $this->jpegAt(800, 600, [120, 220, 80], 'hero.jpg'),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->json();

        $this->assertTrue($res['embed'] ?? false);
        $this->assertStringStartsWith('/storage/', $res['url']);
        $this->assertNotEmpty($res['media_id']);

        $stored = SiteSetting::getScoped('hero_slides', 'website');
        $this->assertStringContainsString('Keep me', (string) $stored);
        $this->assertStringNotContainsString($res['url'], (string) $stored);

        foreach (['url', 'thumb_url', 'original_url', 'image_webp_url', 'thumb_webp_url'] as $field) {
            $this->deleteStorageUrl($res[$field] ?? null);
        }
    }

    private function deleteStorageUrl(?string $url): void
    {
        if (!$url || !str_starts_with($url, '/storage/')) {
            return;
        }
        $rel = ltrim(substr($url, strlen('/storage/')), '/');
        @unlink(storage_path('app/public/' . $rel));
    }
}
