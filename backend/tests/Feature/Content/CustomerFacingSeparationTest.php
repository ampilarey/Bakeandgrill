<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\Blocks\HomeChromeResolver;
use App\Domains\Content\ContentResolver;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\PageBlock;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use App\Support\DocumentBrandView;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Full independence of Website / Order App customer-facing presentation.
 */
class CustomerFacingSeparationTest extends TestCase
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
            'name' => 'Sep Owner',
            'email' => 'sep-owner@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);
    }

    public function test_branding_is_one_business_record_for_both_apps_and_documents(): void
    {
        // Owner decision 2026-08-14 — brand identity is a single business record.
        $this->actingAsOwner();
        SiteSetting::set('logo', '/storage/site/invoice.png', 'shared');
        SiteSetting::set('primary_color', '#111111', 'shared');
        SiteSetting::set('site_name', 'Invoice Name', 'shared');
        // Stale per-app rows must be ignored.
        SiteSetting::set('logo', '/storage/site/order.png', 'order_app');
        SiteSetting::set('logo', '/storage/site/web.png', 'website');
        ContentResolver::bust();

        $this->assertSame('/storage/site/invoice.png', ContentResolver::for('website')->get('logo'));
        $this->assertSame('/storage/site/invoice.png', ContentResolver::for('order_app')->get('logo'));
        $this->assertSame('Invoice Name', ContentResolver::for('website')->get('site_name'));
        $this->assertSame('Invoice Name', ContentResolver::for('order_app')->get('site_name'));

        $brand = DocumentBrandView::variables();
        $this->assertSame('/storage/site/invoice.png', $brand['brandLogoWeb']);
        $this->assertSame('#111111', $brand['brandPrimary']);
        $this->assertSame('Invoice Name', $brand['brandSiteName']);
    }

    public function test_content_api_rejects_per_app_branding_writes(): void
    {
        $this->actingAsOwner();
        SiteSetting::set('logo', '/storage/site/invoice.png', 'shared');
        ContentResolver::bust();

        foreach (['website', 'order_app'] as $scope) {
            $this->putJson('/api/admin/content', [
                'locale' => 'en',
                'changes' => [
                    ['key' => 'logo', 'scope' => $scope, 'value' => '/storage/site/nope.png'],
                    ['key' => 'primary_color', 'scope' => $scope, 'value' => '#ABCDEF'],
                ],
            ])->assertUnprocessable();
        }

        $this->assertSame('/storage/site/invoice.png', ContentResolver::for('website')->get('logo'));
        $this->assertSame('/storage/site/invoice.png', ContentResolver::for('order_app')->get('logo'));
    }

    public function test_business_details_logo_changes_documents_and_both_apps(): void
    {
        // One place to change the logo — it reaches documents, Website and Order App.
        $this->actingAsOwner();
        SiteSetting::set('logo', '/storage/site/web.png', 'website');
        SiteSetting::set('logo', '/storage/site/order.png', 'order_app');

        $this->putJson('/api/admin/business-details', [
            'changes' => [
                ['key' => 'logo', 'value' => '/storage/site/doc.png'],
            ],
        ])->assertOk();

        $this->assertSame('/storage/site/doc.png', SiteSetting::get('logo'));
        $this->assertSame('/storage/site/doc.png', ContentResolver::for('website')->get('logo'));
        $this->assertSame('/storage/site/doc.png', ContentResolver::for('order_app')->get('logo'));
        $this->assertSame('/storage/site/doc.png', DocumentBrandView::variables()['brandLogoWeb']);
    }

    public function test_content_hub_rejects_shared_scope_publish(): void
    {
        $this->actingAsOwner();
        $this->putJson('/api/admin/content', [
            'locale' => 'en',
            'changes' => [
                ['key' => 'site_name', 'scope' => 'shared', 'value' => 'Nope'],
            ],
        ])->assertStatus(422);
    }

    public function test_offers_api_uses_order_app_copy_not_shared(): void
    {
        SiteSetting::set('offers_headline', 'Shared headline', 'shared');
        SiteSetting::set('offers_headline', 'Order headline', 'order_app');
        SiteSetting::set('offers_subtext', 'Order sub', 'order_app');
        SiteSetting::set('offers_headline', 'Web headline', 'website');
        ContentResolver::bust();

        $order = $this->getJson('/api/offers')->assertOk()->json();
        $this->assertSame('Order headline', $order['headline']);
        $this->assertSame('Order sub', $order['subtext']);

        $web = $this->getJson('/api/offers?app=website')->assertOk()->json();
        $this->assertSame('Web headline', $web['headline']);
    }

    public function test_missing_announcement_block_does_not_read_shared_enabled(): void
    {
        SiteSetting::set('announcement_enabled', 'true', 'shared');
        PageBlock::query()->where('block_type', 'announcement')->delete();

        $chrome = HomeChromeResolver::resolve('website', 'announcement');
        $this->assertFalse($chrome['enabled']);
    }

    public function test_unregistered_content_key_does_not_fall_back_to_shared(): void
    {
        SiteSetting::set('totally_unknown_key_xyz', 'from-shared', 'shared');
        $this->assertNull(ContentResolver::for('website')->get('totally_unknown_key_xyz'));
        $this->assertSame('fallback', ContentResolver::for('website')->get('totally_unknown_key_xyz', 'fallback'));
    }

    public function test_website_html_uses_the_business_record_logo(): void
    {
        // The rendered page must follow the business record, not a stale
        // per-app row. This is the end-to-end proof of the 2026-08-14 move.
        SiteSetting::set('logo', '/storage/site/business-logo.png', 'shared');
        SiteSetting::set('logo', '/storage/site/stale-website-logo.png', 'website');
        ContentResolver::bust();

        $html = $this->get('/')->assertOk()->getContent();
        $this->assertStringContainsString('/storage/site/business-logo.png', $html);
        $this->assertStringNotContainsString('/storage/site/stale-website-logo.png', $html);
    }

    public function test_prayer_banner_placement_independent_per_app(): void
    {
        $this->actingAsOwner();
        PageBlock::query()->create([
            'app' => 'website',
            'page' => 'home',
            'block_type' => 'prayer_bar',
            'position' => 0,
            'is_enabled' => true,
            'content_mode' => PageBlock::MODE_OWN,
            'settings' => [
                'show_desktop' => true,
                'show_mobile' => false,
                'placement_desktop' => 'header',
                'placement_mobile' => 'home',
            ],
        ]);
        PageBlock::query()->create([
            'app' => 'order_app',
            'page' => 'home',
            'block_type' => 'prayer_bar',
            'position' => 0,
            'is_enabled' => true,
            'content_mode' => PageBlock::MODE_OWN,
            'settings' => [
                'show_desktop' => false,
                'show_mobile' => true,
                'placement_desktop' => 'home',
                'placement_mobile' => 'header',
            ],
        ]);

        $web = HomeChromeResolver::resolve('website', 'prayer_bar');
        $order = HomeChromeResolver::resolve('order_app', 'prayer_bar');
        $this->assertTrue($web['show_desktop']);
        $this->assertFalse($web['show_mobile']);
        $this->assertFalse($order['show_desktop']);
        $this->assertTrue($order['show_mobile']);
        $this->assertSame('header', $web['placement_desktop']);
        $this->assertSame('header', $order['placement_mobile']);
    }
}
