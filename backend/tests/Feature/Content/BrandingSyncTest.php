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

    public function test_use_as_writes_shared_business_record_only(): void
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

        SiteSetting::set('logo', '/storage/site/web-before.png', 'website');
        SiteSetting::set('logo', '/storage/site/order-before.png', 'order_app');

        foreach (['logo', 'logo_dark', 'favicon', 'og_image', 'default_item_image'] as $key) {
            $this->postJson("/api/admin/media/{$media->id}/use-as", ['key' => $key])
                ->assertOk()
                ->assertJsonPath('key', $key);

            $this->assertSame($media->url, SiteSetting::getScoped($key, 'shared'));
            $this->assertDatabaseHas('audit_logs', ['action' => 'media.use_as']);
        }

        $this->assertSame('/storage/site/web-before.png', SiteSetting::getScoped('logo', 'website'));
        $this->assertSame('/storage/site/order-before.png', SiteSetting::getScoped('logo', 'order_app'));
    }

    public function test_logo_is_one_business_record_shared_by_both_apps_and_invoices(): void
    {
        // Owner decision 2026-08-14 — one business, one identity. Brand images,
        // tagline, socials and tracking IDs live in Business Details only.
        SiteSetting::set('logo', '/storage/site/invoice-logo.png', 'shared');
        SiteSetting::set('primary_color', '#ABCDEF', 'shared');
        // Stale per-app rows must be ignored, not preferred.
        SiteSetting::set('logo', '/storage/site/order-logo.png', 'order_app');
        SiteSetting::set('logo', '/storage/site/old-website-logo.png', 'website');
        ContentResolver::bust();

        $this->assertSame('/storage/site/invoice-logo.png', ContentResolver::for('website')->get('logo'));
        $this->assertSame('/storage/site/invoice-logo.png', ContentResolver::for('order_app')->get('logo'));
        $this->assertSame('/storage/site/invoice-logo.png', SiteSetting::get('logo'));

        $brand = \App\Support\DocumentBrandView::variables();
        $this->assertSame('/storage/site/invoice-logo.png', $brand['brandLogoWeb']);
        $this->assertSame('#ABCDEF', $brand['brandPrimary']);
    }

    public function test_content_api_cannot_write_a_per_app_logo(): void
    {
        SiteSetting::set('logo', '/storage/site/invoice-logo.png', 'shared');
        ContentResolver::bust();

        $this->putJson('/api/admin/content', [
            'locale' => 'en',
            'changes' => [
                ['key' => 'logo', 'scope' => 'website', 'value' => '/storage/site/hub-logo.png'],
            ],
        ])->assertUnprocessable();

        $this->assertSame('/storage/site/invoice-logo.png', ContentResolver::for('website')->get('logo'));
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
