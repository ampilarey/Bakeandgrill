<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\BusinessDetailsKeys;
use App\Domains\Content\ContentResolver;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Signage\Services\SignageResolver;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use App\Support\DocumentBrandView;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use ReflectionMethod;
use Tests\TestCase;

class BusinessDetailsTest extends TestCase
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
            'name' => 'Business Owner',
            'email' => 'business-details@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);
    }

    public function test_show_lists_intersected_shared_keys_only(): void
    {
        $this->actingAsOwner();
        $res = $this->getJson('/api/admin/business-details')->assertOk()->json();
        $keys = collect($res['fields'])->pluck('key')->sort()->values()->all();
        $expected = BusinessDetailsKeys::all();
        sort($expected);
        $this->assertSame($expected, $keys);
        $this->assertSame('shared', $res['scope']);
        $this->assertStringContainsString('invoices', strtolower((string) $res['notice']));
        $this->assertStringContainsString('not on the website', strtolower((string) $res['notice']));
    }

    public function test_update_writes_shared_only_and_feeds_document_brand_and_signage(): void
    {
        $this->actingAsOwner();

        SiteSetting::set('business_phone', '+960 WEB BEFORE', 'website');
        SiteSetting::set('business_phone', '+960 ORDER BEFORE', 'order_app');
        SiteSetting::set('logo', '/images/web-logo.png', 'website');
        SiteSetting::set('logo', '/images/order-logo.png', 'order_app');
        SiteSetting::set('site_name', 'Web Café', 'website');
        SiteSetting::set('site_name', 'Order Café', 'order_app');
        ContentResolver::bust();

        $this->putJson('/api/admin/business-details', [
            'changes' => [
                ['key' => 'business_phone', 'value' => '+960 700 9999'],
                ['key' => 'site_name', 'value' => 'Invoice Brand Name'],
                ['key' => 'logo', 'value' => '/images/invoice-logo.png'],
                ['key' => 'primary_color', 'value' => '#112233'],
            ],
        ])->assertOk();

        $this->assertSame('+960 700 9999', SiteSetting::get('business_phone'));
        $this->assertSame('Invoice Brand Name', SiteSetting::get('site_name'));
        $this->assertSame('/images/invoice-logo.png', SiteSetting::get('logo'));
        $this->assertSame('#112233', SiteSetting::get('primary_color'));

        // App scopes untouched.
        $this->assertSame('+960 WEB BEFORE', SiteSetting::getScoped('business_phone', 'website'));
        $this->assertSame('+960 ORDER BEFORE', SiteSetting::getScoped('business_phone', 'order_app'));
        $this->assertSame('/images/web-logo.png', SiteSetting::getScoped('logo', 'website'));
        $this->assertSame('/images/order-logo.png', SiteSetting::getScoped('logo', 'order_app'));

        $this->assertSame('+960 WEB BEFORE', ContentResolver::for('website')->get('business_phone'));
        $this->assertSame('+960 ORDER BEFORE', ContentResolver::for('order_app')->get('business_phone'));
        $this->assertSame('Web Café', ContentResolver::for('website')->get('site_name'));
        $this->assertSame('Order Café', ContentResolver::for('order_app')->get('site_name'));

        $brand = DocumentBrandView::variables();
        $this->assertSame('Invoice Brand Name', $brand['brandSiteName']);
        $this->assertSame('+960 700 9999', $brand['brandPhone']);
        $this->assertSame('/images/invoice-logo.png', $brand['brandLogoWeb']);
        $this->assertSame('#112233', $brand['brandPrimary']);

        $method = new ReflectionMethod(SignageResolver::class, 'variables');
        $method->setAccessible(true);
        $signage = $method->invoke(app(SignageResolver::class), now());
        $this->assertSame('Invoice Brand Name', $signage['branch_name']);
        $this->assertSame('+960 700 9999', $signage['business_phone']);
    }

    public function test_update_rejects_non_whitelisted_keys_and_never_accepts_app_scope(): void
    {
        $this->actingAsOwner();

        $this->putJson('/api/admin/business-details', [
            'changes' => [
                ['key' => 'hero_slides', 'value' => '[]'],
            ],
        ])->assertUnprocessable();

        $this->putJson('/api/admin/business-details', [
            'changes' => [
                ['key' => 'business_phone', 'value' => '+960 111', 'scope' => 'website'],
            ],
        ])->assertOk();

        $this->assertSame('+960 111', SiteSetting::getScoped('business_phone', 'shared'));
        $this->assertNotSame('+960 111', (string) SiteSetting::getScoped('business_phone', 'website'));
    }
}
