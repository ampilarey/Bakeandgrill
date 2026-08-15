<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentResolver;
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

    public function test_collect_stays_silent_once_every_covered_key_has_one_owner(): void
    {
        // Owner decision 2026-08-14: all 9 keys this notice covers are now owned
        // by Business Details, so leftover app rows are never read. Reporting
        // "Website says …" would be a lie, not a warning.
        SiteSetting::set('site_tagline', 'Shared tagline', 'shared');
        SiteSetting::set('site_tagline', 'Web tagline', 'website');
        SiteSetting::set('site_tagline', 'Order tagline', 'order_app');

        // Page wording is supposed to differ — must never appear in mismatches.
        SiteSetting::set('offers_headline', 'Shared offers', 'shared');
        SiteSetting::set('offers_headline', 'Web offers', 'website');
        SiteSetting::set('offers_headline', 'Order offers', 'order_app');

        SiteSetting::bust();

        $byKey = collect(ContentScopeMismatch::collect('en'))->keyBy('key');

        $this->assertFalse($byKey->has('site_tagline'), 'business-owned keys cannot drift');
        $this->assertFalse($byKey->has('offers_headline'), 'page wording is meant to differ');
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

    public function test_apis_report_no_logo_mismatch_now_that_the_logo_has_one_owner(): void
    {
        $this->actingAsOwner();

        SiteSetting::set('logo', '/storage/site/invoice.png', 'shared');
        // Stale rows from before the move — ignored, so not a mismatch.
        SiteSetting::set('logo', '/storage/site/web.png', 'website');
        SiteSetting::set('logo', '/storage/site/order.png', 'order_app');
        SiteSetting::bust();

        $content = $this->getJson('/api/admin/content?locale=en')->assertOk()->json('mismatches');
        $details = $this->getJson('/api/admin/business-details')->assertOk()->json('mismatches');

        $this->assertNull(collect($content)->firstWhere('key', 'logo'));
        $this->assertNull(collect($details)->firstWhere('key', 'logo'));

        // And the one live value is the business record, for both apps.
        $this->assertSame('/storage/site/invoice.png', ContentResolver::for('website')->get('logo'));
        $this->assertSame('/storage/site/invoice.png', ContentResolver::for('order_app')->get('logo'));
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
