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

        $this->getJson('/api/admin/media?type=image')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
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

    public function test_delete_removes_webp_and_versions_so_reconcile_cannot_resurrect(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        Storage::disk('public')->put('library/images/hero.jpg', 'jpeg-bytes');
        Storage::disk('public')->put('library/images/hero.webp', 'webp-bytes');
        Storage::disk('public')->put('library/images/thumbs/hero.jpg', 'thumb-bytes');
        Storage::disk('public')->put('library/images/masters/hero.jpg', 'master-bytes');
        Storage::disk('public')->put('library/versions/1/backup.jpg', 'backup-bytes');

        $media = Media::create([
            'disk' => 'public',
            'path' => 'library/images/hero.jpg',
            'media_type' => 'image',
            'mime_type' => 'image/jpeg',
            'file_size' => 10,
            'source' => 'library',
            'title' => 'hero',
            'thumb_url' => '/storage/library/images/thumbs/hero.jpg',
            'original_url' => '/storage/library/images/masters/hero.jpg',
            'image_webp_url' => '/storage/library/images/hero.webp',
            'thumb_webp_url' => '/storage/library/images/thumbs/hero.webp',
        ]);
        // Match version dir to the real asset id after create.
        Storage::disk('public')->put('library/versions/' . $media->id . '/backup.jpg', 'backup-bytes');

        $this->deleteJson("/api/admin/media/{$media->id}")->assertOk();
        $this->assertNull(Media::find($media->id));

        $this->assertFalse(Storage::disk('public')->exists('library/images/hero.jpg'));
        $this->assertFalse(Storage::disk('public')->exists('library/images/hero.webp'));
        $this->assertFalse(Storage::disk('public')->exists('library/images/thumbs/hero.jpg'));
        $this->assertFalse(Storage::disk('public')->exists('library/images/masters/hero.jpg'));
        $this->assertFalse(Storage::disk('public')->exists('library/versions/' . $media->id . '/backup.jpg'));

        // Leftover version/webp paths must not re-enter the catalog.
        Storage::disk('public')->put('library/images/orphan.webp', 'webp-bytes');
        Storage::disk('public')->put('library/versions/999/old.jpg', 'old');

        $this->postJson('/api/admin/media/reconcile')
            ->assertOk()
            ->assertJsonPath('created', 0);

        $this->assertSame(0, Media::count());
    }

    public function test_bulk_delete_removes_multiple_and_respects_force(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        Storage::disk('public')->put('library/a.jpg', 'a');
        Storage::disk('public')->put('library/b.jpg', 'b');
        Storage::disk('public')->put('menu/used.jpg', 'u');

        $a = Media::create($this->assetAttrs('library/a.jpg', 'image'));
        $b = Media::create($this->assetAttrs('library/b.jpg', 'image'));
        $used = Media::create($this->assetAttrs('menu/used.jpg', 'image'));

        $category = Category::create(['name' => 'Food', 'slug' => 'food-ml-bulk', 'is_active' => true]);
        Item::create([
            'category_id' => $category->id,
            'name' => 'Burger',
            'base_price' => 10,
            'sku' => 'BURGER-ML-BULK',
            'is_active' => true,
            'is_available' => true,
            'image_url' => $used->url,
        ]);

        $res = $this->postJson('/api/admin/media/bulk-delete', [
            'ids' => [$a->id, $b->id, $used->id],
            'force' => false,
        ])->assertOk();

        $this->assertEqualsCanonicalizing([$a->id, $b->id], $res->json('deleted'));
        $this->assertCount(1, $res->json('blocked'));
        $this->assertSame($used->id, $res->json('blocked.0.id'));
        $this->assertNull(Media::find($a->id));
        $this->assertNull(Media::find($b->id));
        $this->assertNotNull(Media::find($used->id));
        $this->assertFalse(Storage::disk('public')->exists('library/a.jpg'));
        $this->assertFalse(Storage::disk('public')->exists('library/b.jpg'));

        $this->postJson('/api/admin/media/bulk-delete', [
            'ids' => [$used->id],
            'force' => true,
        ])->assertOk()->assertJsonPath('deleted.0', $used->id);

        $this->assertNull(Media::find($used->id));
        $this->assertFalse(Storage::disk('public')->exists('menu/used.jpg'));
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
