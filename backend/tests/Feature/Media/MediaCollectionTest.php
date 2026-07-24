<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Media;
use App\Models\MediaCollection;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MediaCollectionTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        $this->owner = User::create([
            'name' => 'Owner Col',
            'email' => 'owner-col@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($this->owner, ['staff']);
    }

    public function test_starter_collections_seeded(): void
    {
        $this->assertTrue(MediaCollection::where('slug', 'banners')->exists());
        $this->assertTrue(MediaCollection::where('slug', 'logos')->exists());
    }

    public function test_create_rename_delete_collection(): void
    {
        $id = (int) $this->postJson('/api/admin/media/collections', [
            'name' => 'Falcon',
            'description' => 'Falcon shots',
        ])->assertCreated()->json('data.id');

        $this->patchJson("/api/admin/media/collections/{$id}", [
            'name' => 'Falcon Drinks',
        ])->assertOk()->assertJsonPath('data.slug', 'falcon-drinks');

        $this->deleteJson("/api/admin/media/collections/{$id}")->assertOk();
        $this->assertNull(MediaCollection::find($id));
    }

    public function test_assign_multiple_and_filter(): void
    {
        $banners = MediaCollection::where('slug', 'banners')->firstOrFail();
        $drinks = MediaCollection::where('slug', 'drinks')->firstOrFail();
        $media = Media::create([
            'disk' => 'public',
            'path' => 'library/c.jpg',
            'media_type' => 'image',
            'mime_type' => 'image/jpeg',
            'file_size' => 1,
            'source' => 'library',
        ]);

        $this->postJson("/api/admin/media/{$media->id}/collections", [
            'collection_ids' => [$banners->id, $drinks->id],
        ])->assertOk();

        $this->assertCount(2, $media->fresh()->collections);

        $this->getJson('/api/admin/media?collection=banners')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }
}
