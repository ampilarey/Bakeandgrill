<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\DefaultItemImageSync;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Promotions\Services\OffersService;
use App\Models\Category;
use App\Models\DailySpecial;
use App\Models\Item;
use App\Models\Media;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\SpecialPricingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DefaultItemImageTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Storage::fake('public');
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $this->owner = User::create([
            'name' => 'Owner DI',
            'email' => 'owner-di@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
        $this->staff = User::create([
            'name' => 'Staff DI',
            'email' => 'staff-di@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'staff')->value('id'),
            'is_active' => true,
        ]);
    }

    public function test_content_upload_stages_default_item_image_until_publish(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $file = UploadedFile::fake()->image('default-item.jpg', 400, 400);
        SiteSetting::set('default_item_image', '/storage/site/live-default-item.jpg', 'order_app', 'en');
        SiteSetting::set('default_item_image', '/storage/site/invoice-default.jpg', 'shared', 'en');

        $res = $this->post('/api/admin/content/upload', [
            'file' => $file,
            'key' => 'default_item_image',
            'scope' => 'order_app',
        ], ['Accept' => 'application/json'])->assertCreated();

        $url = $res->json('url');
        $this->assertNotEmpty($url);
        $this->assertNotEmpty($res->json('media_id'));
        $this->assertSame('/storage/site/live-default-item.jpg', SiteSetting::getScoped('default_item_image', 'order_app'));
        $this->assertSame('/storage/site/invoice-default.jpg', SiteSetting::get('default_item_image'));

        // /api/site-settings/public is the order-app public payload.
        $public = $this->getJson('/api/site-settings/public')->assertOk()->json('settings');
        $this->assertArrayHasKey('default_item_image', $public);
        $this->assertSame('/storage/site/live-default-item.jpg', $public['default_item_image']);

        $this->putJson('/api/admin/content', [
            'locale' => 'en',
            'changes' => [
                ['key' => 'default_item_image', 'scope' => 'order_app', 'value' => $url],
            ],
        ])->assertOk();

        $this->assertSame($url, SiteSetting::getScoped('default_item_image', 'order_app'));
        $this->assertSame('/storage/site/invoice-default.jpg', SiteSetting::get('default_item_image'));
    }

    public function test_use_as_sets_default_and_brand_key_permission_gated_and_audited(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        Storage::disk('public')->put('library/default.jpg', 'fake');
        $media = Media::create([
            'disk' => 'public',
            'path' => 'library/default.jpg',
            'media_type' => 'image',
            'mime_type' => 'image/jpeg',
            'file_size' => 1200,
            'width' => 200,
            'height' => 200,
            'source' => 'library',
            'title' => 'default.jpg',
        ]);

        SiteSetting::set('logo', '/storage/site/web-before.png', 'website');
        SiteSetting::set('logo', '/storage/site/order-before.png', 'order_app');

        $this->postJson("/api/admin/media/{$media->id}/use-as", ['key' => 'default_item_image'])
            ->assertOk()
            ->assertJsonPath('key', 'default_item_image');

        $this->assertSame($media->url, SiteSetting::get('default_item_image'));
        $this->assertDatabaseHas('audit_logs', ['action' => 'media.use_as']);

        $this->postJson("/api/admin/media/{$media->id}/use-as", ['key' => 'logo'])
            ->assertOk()
            ->assertJsonPath('key', 'logo');
        // Media "use as" writes the business record only.
        $this->assertSame($media->url, SiteSetting::get('logo'));
        $this->assertSame($media->url, SiteSetting::getScoped('logo', 'shared'));
        $this->assertSame('/storage/site/web-before.png', SiteSetting::getScoped('logo', 'website'));
        $this->assertSame('/storage/site/order-before.png', SiteSetting::getScoped('logo', 'order_app'));
        $this->assertDatabaseHas('content_revisions', ['key' => 'logo']);

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson("/api/admin/media/{$media->id}/use-as", ['key' => 'favicon'])
            ->assertForbidden();
    }

    public function test_home_special_card_uses_default_item_image_when_set(): void
    {
        SiteSetting::set('default_item_image', '/storage/site/default_item.jpg', 'website');
        $row = SiteSetting::query()
            ->where('key', 'default_item_image')
            ->where('scope', 'website')
            ->first();
        $row?->update(['is_public' => true, 'type' => 'image', 'group' => 'Branding']);

        $this->seedImageLessSpecial();

        $html = $this->get('/')->assertOk()->getContent();
        $this->assertStringContainsString('data-default-item-image="1"', $html);
        $this->assertStringContainsString('/storage/site/default_item.jpg', $html);
    }

    public function test_content_studio_website_publish_updates_home_only(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $url = '/storage/site/website_default.jpg';
        SiteSetting::set('default_item_image', '/storage/site/order-default.jpg', 'order_app');
        SiteSetting::set('default_item_image', '/storage/site/shared-default.jpg', 'shared');

        $this->putJson('/api/admin/content', [
            'locale' => 'en',
            'changes' => [
                ['key' => 'default_item_image', 'scope' => 'website', 'value' => $url],
            ],
        ])->assertOk();

        $this->assertSame($url, SiteSetting::getScoped('default_item_image', 'website'));
        $this->assertSame('/storage/site/shared-default.jpg', SiteSetting::get('default_item_image'));
        $this->assertSame('/storage/site/order-default.jpg', SiteSetting::getScoped('default_item_image', 'order_app'));

        $public = $this->getJson('/api/site-settings/public')->assertOk()->json('settings');
        $this->assertSame('/storage/site/order-default.jpg', $public['default_item_image'] ?? null);

        $orderContent = $this->getJson('/api/content?app=order_app&locale=en')->assertOk()->json('content');
        $this->assertSame('/storage/site/order-default.jpg', $orderContent['default_item_image'] ?? null);

        $this->seedImageLessSpecial();
        $html = $this->get('/')->assertOk()->getContent();
        $this->assertStringContainsString('data-default-item-image="1"', $html);
        $this->assertStringContainsString($url, $html);
    }

    public function test_order_app_does_not_resolve_website_only_default_item_image(): void
    {
        SiteSetting::set('default_item_image', '', 'shared');
        SiteSetting::set('default_item_image', '', 'order_app');
        SiteSetting::set('default_item_image', '/storage/site/web_only.jpg', 'website');
        SiteSetting::bust();

        $orderContent = $this->getJson('/api/content?app=order_app&locale=en')->assertOk()->json('content');
        $this->assertNotSame('/storage/site/web_only.jpg', $orderContent['default_item_image'] ?? null);
    }

    public function test_sync_copies_website_value_into_order_app_public_payload_and_busts_cache(): void
    {
        SiteSetting::set('default_item_image', '', 'shared');
        SiteSetting::set('default_item_image', '', 'order_app');
        SiteSetting::set('default_item_image', '/storage/site/stuck_web.jpg', 'website');
        // Poison the forever cache the way production did before the cross-scope fix.
        Cache::forever('content.resolved.order_app.en', [
            'default_item_image' => '',
            'logo' => '/logo.png',
        ]);

        DefaultItemImageSync::run();

        $this->assertSame('/storage/site/stuck_web.jpg', SiteSetting::getScoped('default_item_image', 'order_app'));
        $this->assertSame('/storage/site/stuck_web.jpg', SiteSetting::getScoped('default_item_image', 'shared'));

        $orderContent = $this->getJson('/api/content?app=order_app&locale=en')->assertOk()->json('content');
        $this->assertSame('/storage/site/stuck_web.jpg', $orderContent['default_item_image'] ?? null);
    }

    private function seedImageLessSpecial(): void
    {
        $category = Category::create(['name' => 'Grill', 'slug' => 'grill-di-'.uniqid(), 'is_active' => true]);
        $item = Item::create([
            'category_id' => $category->id,
            'name' => 'No Photo Burger',
            'base_price' => 50,
            'sku' => 'DI-B'.uniqid(),
            'barcode' => 'DI-B'.uniqid(),
            'is_active' => true,
            'is_available' => true,
            'image_url' => null,
        ]);
        DailySpecial::create([
            'item_id' => $item->id,
            'is_active' => true,
            'start_date' => today()->toDateString(),
            'end_date' => today()->toDateString(),
            'discount_pct' => 10,
            'badge_label' => '10% OFF',
        ]);
        app(OffersService::class)->bustCache();
        app(SpecialPricingService::class)->bustCache();
    }
}
