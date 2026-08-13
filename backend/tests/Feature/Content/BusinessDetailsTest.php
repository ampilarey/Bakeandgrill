<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\BusinessDetailsKeys;
use App\Domains\Content\ContentResolver;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Signage\Services\SignageResolver;
use App\Models\GstSetting;
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
        $this->assertStringContainsString('content & branding', strtolower((string) $res['notice']));
    }

    public function test_show_returns_grouped_sections_hours_and_legal(): void
    {
        $this->actingAsOwner();

        GstSetting::query()->firstOrFail()->update([
            'gst_registered' => true,
            'seller_name' => 'Bake & Grill Pvt Ltd',
            'seller_address' => 'Malé, Maldives',
            'seller_tin' => 'TIN-123',
            'taxable_activity_no' => 'TAN-9',
            'default_tax_rate_bp' => 800,
            'tax_inclusive' => true,
        ]);

        SiteSetting::set('business_phone', '+960 700 1111', 'shared');
        SiteSetting::set('site_name', 'Bake & Grill', 'shared');
        SiteSetting::set('business_address', 'Kalaafaanu Hingun', 'shared');
        SiteSetting::set('business_closures_json', json_encode([
            '2099-12-25' => 'Holiday closure',
        ]), 'shared');
        ContentResolver::bust();

        $res = $this->getJson('/api/admin/business-details')->assertOk()->json();

        $sectionIds = collect($res['sections'])->pluck('id')->all();
        $this->assertSame(['identity', 'address', 'contact', 'documents'], $sectionIds);

        foreach (['identity', 'address', 'contact', 'documents'] as $id) {
            $section = collect($res['sections'])->firstWhere('id', $id);
            $this->assertNotEmpty($section['fields']);
            foreach ($section['fields'] as $field) {
                $this->assertArrayHasKey('used_by', $field);
                $this->assertIsArray($field['used_by']);
            }
        }

        $this->assertArrayHasKey('hours', $res);
        $this->assertSame('business_hours_json', $res['hours']['source']);
        $this->assertSame('/admin/online-ordering', $res['hours']['editor_path']);
        $this->assertCount(7, $res['hours']['weekly']);
        $this->assertNotEmpty($res['hours']['closures']);
        $this->assertSame('2099-12-25', $res['hours']['closures'][0]['date']);

        $this->assertArrayHasKey('legal', $res);
        $this->assertSame('gst_settings', $res['legal']['source']);
        $this->assertSame('/admin/gst', $res['legal']['editor_path']);
        $this->assertSame('Bake & Grill Pvt Ltd', $res['legal']['seller_name']);
        $this->assertSame('TIN-123', $res['legal']['seller_tin']);
        $this->assertTrue($res['legal']['gst_registered']);
        $this->assertSame('Bake & Grill', $res['legal']['receipt_name']);
        $this->assertSame('+960 700 1111', $res['legal']['receipt_phone']);
        $this->assertSame('Kalaafaanu Hingun', $res['legal']['receipt_address']);

        // Marketing / app content keys must not appear.
        $allKeys = collect($res['fields'])->pluck('key');
        $this->assertFalse($allKeys->contains('hero_slides'));
        $this->assertFalse($allKeys->contains('cta_band_headline'));
        $this->assertFalse($allKeys->contains('homepage_categories'));
        $this->assertFalse($allKeys->contains('primary_color_website'));
    }

    public function test_unauthorised_user_is_blocked(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $user = User::create([
            'name' => 'Staffer',
            'email' => 'staff-business-details@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);

        $this->getJson('/api/admin/business-details')->assertForbidden();
        $this->putJson('/api/admin/business-details', [
            'changes' => [['key' => 'business_phone', 'value' => '+960 000']],
        ])->assertForbidden();
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
                ['key' => 'business_address_line1', 'value' => 'Street One'],
                ['key' => 'maps_embed_url', 'value' => 'https://www.google.com/maps?q=Male&output=embed'],
            ],
        ])->assertOk();

        $this->assertSame('+960 700 9999', SiteSetting::get('business_phone'));
        $this->assertSame('Invoice Brand Name', SiteSetting::get('site_name'));
        $this->assertSame('/images/invoice-logo.png', SiteSetting::get('logo'));
        $this->assertSame('#112233', SiteSetting::get('primary_color'));
        $this->assertSame('Street One', SiteSetting::getScoped('business_address_line1', 'shared'));
        $this->assertSame(
            'https://www.google.com/maps?q=Male&output=embed',
            SiteSetting::getScoped('maps_embed_url', 'shared'),
        );

        // App scopes untouched — no duplicate Website/Order App content source.
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

    public function test_update_rejects_invalid_url_and_non_whitelisted_keys(): void
    {
        $this->actingAsOwner();

        $this->putJson('/api/admin/business-details', [
            'changes' => [
                ['key' => 'hero_slides', 'value' => '[]'],
            ],
        ])->assertUnprocessable();

        $this->putJson('/api/admin/business-details', [
            'changes' => [
                ['key' => 'business_maps_url', 'value' => 'javascript:alert(1)'],
            ],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['business_maps_url']);

        $this->putJson('/api/admin/business-details', [
            'changes' => [
                ['key' => 'business_phone', 'value' => '+960 111', 'scope' => 'website'],
            ],
        ])->assertOk();

        $this->assertSame('+960 111', SiteSetting::getScoped('business_phone', 'shared'));
        $this->assertNotSame('+960 111', (string) SiteSetting::getScoped('business_phone', 'website'));
    }

    public function test_legal_values_remain_gst_authoritative_after_business_details_save(): void
    {
        $this->actingAsOwner();

        $gst = GstSetting::query()->firstOrFail();
        $gst->update([
            'gst_registered' => true,
            'seller_name' => 'Legal Co',
            'seller_tin' => 'KEEP-TIN',
            'default_tax_rate_bp' => 800,
            'tax_inclusive' => true,
        ]);

        $this->putJson('/api/admin/business-details', [
            'changes' => [
                ['key' => 'site_name', 'value' => 'Receipt Display Name'],
            ],
        ])->assertOk();

        $gst->refresh();
        $this->assertSame('Legal Co', $gst->seller_name);
        $this->assertSame('KEEP-TIN', $gst->seller_tin);

        $res = $this->getJson('/api/admin/business-details')->assertOk()->json();
        $this->assertSame('Legal Co', $res['legal']['seller_name']);
        $this->assertSame('Receipt Display Name', $res['legal']['receipt_name']);
        $this->assertSame('gst_settings', $res['legal']['source']);
    }
}
