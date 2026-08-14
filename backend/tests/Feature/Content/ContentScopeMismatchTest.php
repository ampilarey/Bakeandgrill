<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentScopeMismatch;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContentScopeMismatchTest extends TestCase
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
            'name' => 'Mismatch Owner',
            'email' => 'mismatch@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);
    }

    public function test_collect_reports_surface_fact_drift_and_skips_page_wording(): void
    {
        SiteSetting::set('site_tagline', 'Shared tagline', 'shared');
        SiteSetting::set('site_tagline', 'Web tagline', 'website');
        SiteSetting::set('site_tagline', 'Order tagline', 'order_app');

        // Page wording is supposed to differ — must never appear in mismatches.
        SiteSetting::set('offers_headline', 'Shared offers', 'shared');
        SiteSetting::set('offers_headline', 'Web offers', 'website');
        SiteSetting::set('offers_headline', 'Order offers', 'order_app');

        SiteSetting::bust();

        $rows = ContentScopeMismatch::collect('en');
        $byKey = collect($rows)->keyBy('key');

        $this->assertTrue($byKey->has('site_tagline'));
        $this->assertFalse($byKey->has('offers_headline'));
        $this->assertSame(
            'Business record says Shared tagline · Website says Web tagline · Order app says Order tagline',
            $byKey['site_tagline']['message'],
        );
    }

    public function test_ops_owned_business_details_keys_never_report_leftover_app_rows(): void
    {
        SiteSetting::set('business_phone', '+9609120011', 'shared');
        SiteSetting::set('business_phone', '912 0011', 'website');
        SiteSetting::set('business_phone', '912 0011', 'order_app');
        SiteSetting::set('site_name', 'Bake & Grill', 'shared');
        SiteSetting::set('site_name', 'Website Name', 'website');
        SiteSetting::bust();

        $byKey = collect(ContentScopeMismatch::collect('en'))->keyBy('key');

        $this->assertFalse($byKey->has('business_phone'));
        $this->assertFalse($byKey->has('site_name'));
    }

    public function test_content_and_business_details_apis_expose_mismatches(): void
    {
        $this->actingAsOwner();

        SiteSetting::set('logo', '/storage/site/invoice.png', 'shared');
        SiteSetting::set('logo', '/storage/site/web.png', 'website');
        SiteSetting::set('logo', '/storage/site/order.png', 'order_app');
        SiteSetting::bust();

        $content = $this->getJson('/api/admin/content?locale=en')->assertOk()->json('mismatches');
        $details = $this->getJson('/api/admin/business-details')->assertOk()->json('mismatches');

        $this->assertNotEmpty($content);
        $this->assertNotEmpty($details);
        $contentLogo = collect($content)->firstWhere('key', 'logo');
        $detailsLogo = collect($details)->firstWhere('key', 'logo');
        $this->assertNotNull($contentLogo);
        $this->assertNotNull($detailsLogo);
        $this->assertStringContainsString('invoice.png', $contentLogo['message']);
        $this->assertStringContainsString('web.png', $contentLogo['message']);
        $this->assertStringContainsString('order.png', $contentLogo['message']);
        $this->assertSame($contentLogo['message'], $detailsLogo['message']);
    }

    public function test_matching_scopes_produce_no_mismatch(): void
    {
        SiteSetting::set('site_tagline', 'Same Everywhere', 'shared');
        SiteSetting::set('site_tagline', 'Same Everywhere', 'website');
        SiteSetting::set('site_tagline', 'Same Everywhere', 'order_app');
        SiteSetting::bust();

        $rows = collect(ContentScopeMismatch::collect('en'))->where('key', 'site_tagline');
        $this->assertCount(0, $rows);
    }
}
