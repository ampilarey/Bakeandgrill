<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\Media;
use App\Models\MediaCollection;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MediaLibraryControllerTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $this->owner = User::create([
            'name' => 'Owner ML',
            'email' => 'owner-ml@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
        $this->staff = User::create([
            'name' => 'Staff ML',
            'email' => 'staff-ml@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'staff')->value('id'),
            'is_active' => true,
        ]);
    }

    public function test_list_filters_and_paginates(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        Media::create($this->assetAttrs('library/a.jpg', 'image'));
        Media::create($this->assetAttrs('library/b.pdf', 'document', 'application/pdf'));

        $res = $this->getJson('/api/admin/media?type=image')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);

        $this->assertNotEmpty($res->json('data.0.updated_at'));
    }

    public function test_use_as_sets_site_setting_and_favicon_uses_derivative(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $img = imagecreatetruecolor(240, 180);
        $white = imagecolorallocate($img, 255, 255, 255);
        imagefilledrectangle($img, 0, 0, 239, 179, $white);
        ob_start();
        imagejpeg($img, null, 90);
        $bytes = (string) ob_get_clean();
        imagedestroy($img);

        Storage::disk('public')->put('library/brand.jpg', $bytes);
        $media = Media::create(array_merge($this->assetAttrs('library/brand.jpg', 'image'), [
            'width' => 240,
            'height' => 180,
            'file_size' => strlen($bytes),
        ]));

        $logoRes = $this->postJson("/api/admin/media/{$media->id}/use-as", ['key' => 'logo'])
            ->assertOk()
            ->assertJsonPath('key', 'logo');
        $this->assertSame('/storage/library/brand.jpg', $logoRes->json('url'));
        $this->assertSame('/storage/library/brand.jpg', \App\Models\SiteSetting::get('logo'));

        $favRes = $this->postJson("/api/admin/media/{$media->id}/use-as", ['key' => 'favicon'])
            ->assertOk()
            ->assertJsonPath('key', 'favicon');
        $favUrl = (string) $favRes->json('url');
        $this->assertStringContainsString('/storage/site/favicon_', $favUrl);
        $this->assertStringEndsWith('.png', $favUrl);
        $this->assertSame($favUrl, \App\Models\SiteSetting::get('favicon'));
        if (\App\Models\SiteSetting::hasScopeColumn()) {
            $this->assertSame($favUrl, \App\Models\SiteSetting::getScoped('favicon', 'shared', 'en'));
            $this->assertSame($favUrl, \App\Models\SiteSetting::getScoped('favicon', 'website', 'en'));
            $this->assertSame($favUrl, \App\Models\SiteSetting::getScoped('favicon', 'order_app', 'en'));
        }

        $relative = ltrim(str_replace('/storage/', '', $favUrl), '/');
        $this->assertTrue(Storage::disk('public')->exists($relative));
    }

    public function test_upload_image_creates_row(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $file = UploadedFile::fake()->image('photo.jpg', 400, 300);

        $res = $this->post('/api/admin/media', [
            'files' => [$file],
        ], ['Accept' => 'application/json'])->assertCreated();

        $this->assertSame('image', $res->json('data.0.asset.media_type'));
        $this->assertFalse((bool) $res->json('data.0.deduped'));
    }

    public function test_patch_metadata(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $media = Media::create($this->assetAttrs('library/x.jpg', 'image'));

        $this->patchJson("/api/admin/media/{$media->id}", [
            'title' => 'Hero',
            'alt_text' => 'Alt',
            'tags' => ['promo'],
        ])->assertOk()->assertJsonPath('data.title', 'Hero');
    }

    public function test_delete_blocked_when_in_use(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        Storage::disk('public')->put('menu/used.jpg', 'x');
        $media = Media::create($this->assetAttrs('menu/used.jpg', 'image'));
        $url = $media->url;

        $category = Category::create(['name' => 'Food', 'slug' => 'food-ml-ctrl', 'is_active' => true]);
        Item::create([
            'category_id' => $category->id,
            'name' => 'Burger',
            'base_price' => 10,
            'sku' => 'BURGER-ML-1',
            'is_active' => true,
            'is_available' => true,
            'image_url' => $url,
        ]);

        $this->deleteJson("/api/admin/media/{$media->id}")->assertStatus(409);

        $this->deleteJson("/api/admin/media/{$media->id}?force=1")->assertOk();
        $this->assertNull(Media::find($media->id));
    }

    public function test_permission_gates(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);
        $this->getJson('/api/admin/media')->assertForbidden();
        $this->postJson('/api/admin/media/reconcile')->assertForbidden();
    }

    public function test_reconcile_endpoint(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        Storage::disk('public')->put('menu/sync.jpg', 'jpeg');
        $this->postJson('/api/admin/media/reconcile')->assertOk()->assertJsonStructure(['scanned', 'created', 'skipped']);
    }

    /** @return array<string, mixed> */
    private function assetAttrs(string $path, string $type, string $mime = 'image/jpeg'): array
    {
        return [
            'disk' => 'public',
            'path' => $path,
            'media_type' => $type,
            'mime_type' => $mime,
            'file_size' => 10,
            'source' => 'library',
            'title' => basename($path),
        ];
    }
}
