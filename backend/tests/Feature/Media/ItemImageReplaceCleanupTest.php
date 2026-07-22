<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\Role;
use App\Models\User;
use App\Support\MediaFileCleaner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ItemImageReplaceCleanupTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    private function actingAsOwner(): User
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $user = User::create([
            'name' => 'Media Owner',
            'email' => 'media-owner@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);

        return $user;
    }

    private function putOwned(string $relative): string
    {
        Storage::disk('public')->put($relative, 'fake-bytes');

        return '/storage/'.ltrim($relative, '/');
    }

    public function test_updating_image_url_deletes_superseded_owned_file(): void
    {
        $this->actingAsOwner();
        $old = $this->putOwned('menu/old.jpg');
        $oldMaster = $this->putOwned('menu-masters/old.jpg');
        $item = Item::factory()->create([
            'image_url' => $old,
            'image_original_url' => $oldMaster,
        ]);

        $new = $this->putOwned('menu/new.jpg');
        $newMaster = $this->putOwned('menu-masters/new.jpg');

        $this->patchJson("/api/items/{$item->id}", [
            'image_url' => $new,
            'image_original_url' => $newMaster,
        ])->assertOk();

        $this->assertFalse(Storage::disk('public')->exists('menu/old.jpg'));
        $this->assertFalse(Storage::disk('public')->exists('menu-masters/old.jpg'));
        $this->assertTrue(Storage::disk('public')->exists('menu/new.jpg'));
        $this->assertTrue(Storage::disk('public')->exists('menu-masters/new.jpg'));
        $this->assertSame($new, $item->fresh()->image_url);
    }

    public function test_replacing_with_external_does_not_treat_target_as_owned(): void
    {
        $this->actingAsOwner();
        $old = $this->putOwned('menu/owned.jpg');
        $item = Item::factory()->create(['image_url' => $old]);

        $this->patchJson("/api/items/{$item->id}", [
            'image_url' => 'https://cdn.example.com/remote.jpg',
        ])->assertOk();

        $this->assertFalse(Storage::disk('public')->exists('menu/owned.jpg'));
        $this->assertFalse(MediaFileCleaner::isOwnedUpload('https://cdn.example.com/remote.jpg'));
        $this->assertSame('https://cdn.example.com/remote.jpg', $item->fresh()->image_url);
    }

    public function test_replacing_keeps_shared_master_still_in_use(): void
    {
        $this->actingAsOwner();
        $shared = $this->putOwned('menu-masters/shared.jpg');
        $item = Item::factory()->create([
            'image_url' => $this->putOwned('menu/a.jpg'),
            'image_original_url' => $shared,
        ]);
        Item::factory()->create([
            'image_url' => $this->putOwned('menu/b.jpg'),
            'image_original_url' => $shared,
        ]);

        $this->patchJson("/api/items/{$item->id}", [
            'image_url' => $this->putOwned('menu/a2.jpg'),
            'image_original_url' => $this->putOwned('menu-masters/a2.jpg'),
        ])->assertOk();

        $this->assertTrue(Storage::disk('public')->exists('menu-masters/shared.jpg'));
        $this->assertFalse(Storage::disk('public')->exists('menu/a.jpg'));
    }
}
