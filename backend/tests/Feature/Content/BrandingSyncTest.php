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

    public function test_content_resolver_returns_same_logo_for_both_apps_after_hub_write(): void
    {
        $url = '/storage/site/hub-logo.png';
        $this->putJson('/api/admin/content', [
            'locale' => 'en',
            'changes' => [
                ['key' => 'logo', 'scope' => 'website', 'value' => $url],
            ],
        ])->assertOk();

        $this->assertSame($url, ContentResolver::for('website')->get('logo'));
        $this->assertSame($url, ContentResolver::for('order_app')->get('logo'));
        $this->assertTrue(ContentRegistry::isSyncedAcrossApps('logo'));
        $this->assertSame('same', ContentRegistry::linkState('logo'));
    }

    public function test_share_collapse_does_not_delete_referenced_media_files(): void
    {
        Storage::disk('public')->put('site/website/a.jpg', 'AAA');
        Storage::disk('public')->put('site/order_app/b.jpg', 'BBB');
        $urlA = '/storage/site/website/a.jpg';
        $urlB = '/storage/site/order_app/b.jpg';

        Media::create([
            'disk' => 'public',
            'path' => 'site/order_app/b.jpg',
            'media_type' => 'image',
            'mime_type' => 'image/jpeg',
            'file_size' => 3,
            'source' => 'content',
            'title' => 'b.jpg',
        ]);

        // Dual-app text block holding the URL as the value (image keys are brand-synced).
        SiteSetting::set('home_delivery_tagline', $urlA, 'website');
        SiteSetting::set('home_delivery_tagline', $urlB, 'order_app');
        SiteSetting::set('home_delivery_tagline', '', 'shared');

        $this->assertSame('different', ContentRegistry::linkState('home_delivery_tagline'));
        $this->assertTrue(MediaFileCleaner::isReferenced($urlA));
        $this->assertTrue(MediaFileCleaner::isReferenced($urlB));

        $this->postJson('/api/admin/content/home_delivery_tagline/share', ['locale' => 'en', 'source' => 'website'])->assertOk();

        // B7: collapsing to Same must never delete files still on disk / in catalog.
        $this->assertTrue(Storage::disk('public')->exists('site/website/a.jpg'));
        $this->assertTrue(Storage::disk('public')->exists('site/order_app/b.jpg'));
        $this->assertTrue(Media::query()->where('path', 'site/order_app/b.jpg')->exists());
        $this->assertTrue(MediaFileCleaner::isReferenced($urlB));
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
