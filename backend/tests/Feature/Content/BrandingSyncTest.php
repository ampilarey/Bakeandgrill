<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentRegistry;
use App\Domains\Content\ContentResolver;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\ContentRevision;
use App\Models\Media;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use App\Support\MediaFileCleaner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BrandingSyncTest extends TestCase
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
            'name' => 'Brand Owner',
            'email' => 'brand-sync@test.local',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($this->owner, ['staff']);
    }

    public function test_use_as_writes_all_three_scopes_and_creates_revision(): void
    {
        Storage::disk('public')->put('library/logo.jpg', 'fake');
        $media = Media::create([
            'disk' => 'public',
            'path' => 'library/logo.jpg',
            'media_type' => 'image',
            'mime_type' => 'image/jpeg',
            'file_size' => 100,
            'width' => 100,
            'height' => 100,
            'source' => 'library',
            'title' => 'logo.jpg',
        ]);

        foreach (['logo', 'logo_dark', 'favicon', 'og_image', 'default_item_image'] as $key) {
            $this->postJson("/api/admin/media/{$media->id}/use-as", ['key' => $key])
                ->assertOk()
                ->assertJsonPath('key', $key);

            $this->assertSame($media->url, SiteSetting::getScoped($key, 'shared'));
            $this->assertSame($media->url, SiteSetting::getScoped($key, 'website'));
            $this->assertSame($media->url, SiteSetting::getScoped($key, 'order_app'));
            $this->assertTrue(
                ContentRevision::query()->where('key', $key)->exists(),
                "Expected content revision for {$key}",
            );
            $this->assertDatabaseHas('audit_logs', ['action' => 'media.use_as']);
        }
    }

    public function test_content_resolver_logo_is_independent_per_app_after_hub_write(): void
    {
        SiteSetting::set('logo', '/storage/site/order-logo.png', 'order_app');
        SiteSetting::set('logo', '/storage/site/invoice-logo.png', 'shared');

        $url = '/storage/site/hub-logo.png';
        $this->putJson('/api/admin/content', [
            'locale' => 'en',
            'changes' => [
                ['key' => 'logo', 'scope' => 'website', 'value' => $url],
            ],
        ])->assertOk();

        $this->assertSame($url, ContentResolver::for('website')->get('logo'));
        // Until C.4 removes brand mirroring this may still sync — assert website wrote.
        $this->assertSame($url, SiteSetting::getScoped('logo', 'website'));
    }

    public function test_media_file_cleaner_treats_site_settings_and_media_assets_as_refs(): void
    {
        $url = '/storage/site/only-in-settings.jpg';
        SiteSetting::set('logo', $url, 'shared');
        $this->assertTrue(MediaFileCleaner::isReferenced($url));

        SiteSetting::set('logo', '', 'shared');
        Storage::disk('public')->put('site/catalog-only.jpg', 'x');
        Media::create([
            'disk' => 'public',
            'path' => 'site/catalog-only.jpg',
            'media_type' => 'image',
            'mime_type' => 'image/jpeg',
            'file_size' => 1,
            'source' => 'library',
            'title' => 'catalog-only.jpg',
        ]);
        $this->assertTrue(MediaFileCleaner::isReferenced('/storage/site/catalog-only.jpg'));
    }

    public function test_hub_blocks_exclude_deprecated_hero_slide_keys(): void
    {
        $keys = array_keys(ContentRegistry::hubBlocks());
        $this->assertNotContains('hero_slide_1', $keys);
        $this->assertNotContains('hero_slide_2', $keys);
        $this->assertNotContains('hero_slide_3', $keys);
        $this->assertContains('hero_slides', $keys);
    }
}
