<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContentCropMasterTest extends TestCase
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
            'name' => 'Crop Owner',
            'email' => 'crop-owner@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);
    }

    public function test_upload_returns_master_url_for_hero_slides(): void
    {
        Storage::fake('public');
        $this->actingAsOwner();

        $res = $this->post('/api/admin/content/upload', [
            'key' => 'hero_slides',
            'scope' => 'website',
            'file' => UploadedFile::fake()->image('hero.jpg', 800, 600),
            'original' => UploadedFile::fake()->image('hero-master.jpg', 1600, 1200),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->json();

        $this->assertNotEmpty($res['url']);
        $this->assertNotEmpty($res['original_url']);
        $this->assertTrue($res['embed'] ?? false);
        $this->assertStringStartsWith('/storage/', $res['original_url']);
    }
}
