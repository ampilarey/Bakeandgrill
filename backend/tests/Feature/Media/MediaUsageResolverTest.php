<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Domains\Media\Services\MediaUsageResolver;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\Media;
use App\Models\Role;
use App\Models\SiteSetting;
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
}
