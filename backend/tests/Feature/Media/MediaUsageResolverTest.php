<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Domains\Media\Services\MediaUsageResolver;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\ContentDraft;
use App\Models\ContentRevision;
use App\Models\Item;
use App\Models\Media;
use App\Models\PageBlock;
use App\Models\PageBlockSharedContent;
use App\Models\PageLayoutDraft;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MediaUsageResolverTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
    }

    public function test_reports_item_and_setting_usage(): void
    {
        Storage::disk('public')->put('menu/u.jpg', 'x');
        $media = Media::create([
            'disk' => 'public',
            'path' => 'menu/u.jpg',
            'media_type' => 'image',
            'mime_type' => 'image/jpeg',
            'file_size' => 1,
            'source' => 'menu',
        ]);
        $url = $media->url;

        $category = Category::create(['name' => 'Food', 'slug' => 'food-usage-ml', 'is_active' => true]);
        Item::create([
            'category_id' => $category->id,
            'name' => 'Used Item',
            'base_price' => 5,
            'sku' => 'USED-ML-1',
            'is_active' => true,
            'is_available' => true,
            'image_url' => $url,
        ]);

        SiteSetting::set('logo', $url);

        $usage = app(MediaUsageResolver::class)->for($media);
        $types = collect($usage)->pluck('type')->all();
        $this->assertContains('item', $types);
        $this->assertContains('site_setting', $types);
    }

    public function test_unused_is_empty(): void
    {
        Storage::disk('public')->put('menu/free.jpg', 'x');
        $media = Media::create([
            'disk' => 'public',
            'path' => 'menu/free.jpg',
            'media_type' => 'image',
            'mime_type' => 'image/jpeg',
            'file_size' => 1,
            'source' => 'menu',
        ]);

        $this->assertSame([], app(MediaUsageResolver::class)->for($media));
    }

    public function test_reports_page_block_and_content_json_usage(): void
    {
        Storage::disk('public')->put('content/block.jpg', 'x');
        $media = Media::create([
            'disk' => 'public',
            'path' => 'content/block.jpg',
            'media_type' => 'image',
            'mime_type' => 'image/jpeg',
            'file_size' => 1,
            'source' => 'content',
        ]);

        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        $user = User::create([
            'name' => 'Media User',
            'email' => 'media-json@test.local',
            'password' => 'secret',
            'role_id' => $role->id,
            'pin_hash' => 'pin',
            'is_active' => true,
        ]);

        PageBlock::create([
            'app' => 'website',
            'page' => 'home',
            'block_type' => 'image',
            'position' => 99,
            'is_enabled' => true,
            'content_mode' => 'own',
            'settings' => ['media_id' => $media->id],
        ]);
        PageBlockSharedContent::create([
            'uuid' => (string) \Illuminate\Support\Str::uuid(),
            'block_type' => 'rich_text',
            'settings' => ['body' => '<img src="'.$media->url.'" alt="">'],
        ]);
        PageLayoutDraft::create([
            'user_id' => $user->id,
            'app' => 'website',
            'page' => 'home',
            'version' => 1,
            'payload' => ['blocks' => [['settings' => ['media_id' => $media->id]]]],
        ]);
        ContentDraft::create([
            'user_id' => $user->id,
            'key' => 'hero_slides',
            'scope' => 'website',
            'locale' => 'en',
            'value' => json_encode([['image' => $media->url]]),
            'version' => 1,
        ]);
        ContentRevision::create([
            'key' => 'hero_slides',
            'scope' => 'website',
            'locale' => 'en',
            'value' => json_encode([['image' => $media->url]]),
            'is_draft' => false,
            'created_at' => now(),
        ]);

        $types = collect(app(MediaUsageResolver::class)->for($media))->pluck('type')->all();

        $this->assertContains('page_block', $types);
        $this->assertContains('page_block_shared_content', $types);
        $this->assertContains('page_layout_draft', $types);
        $this->assertContains('content_draft', $types);
        $this->assertContains('content_revision', $types);
    }
}
