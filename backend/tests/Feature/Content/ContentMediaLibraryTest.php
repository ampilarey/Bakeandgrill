<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContentMediaLibraryTest extends TestCase
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
            'name' => 'Media Owner',
            'email' => 'media-owner@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);
    }

    public function test_media_library_lists_site_uploads(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('site/hero.jpg', 'fake');
        Storage::disk('public')->put('site/website/banner.png', 'fake');
        Storage::disk('public')->put('site/masters/skip.jpg', 'fake');

        $this->actingAsOwner();

        $items = $this->getJson('/api/admin/content/media')
            ->assertOk()
            ->json('items');

        $urls = collect($items)->pluck('url')->all();
        $this->assertContains('/storage/site/hero.jpg', $urls);
        $this->assertContains('/storage/site/website/banner.png', $urls);
        $this->assertNotContains('/storage/site/masters/skip.jpg', $urls);
    }

    public function test_media_library_requires_auth(): void
    {
        $this->getJson('/api/admin/content/media')->assertUnauthorized();
    }
}
