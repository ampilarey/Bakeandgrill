<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentResolver;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Settings\OpsOwnedContent;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner decision 2026-08-14 — one business, one identity.
 *
 * Guards the move of brand images, tagline, social accounts and tracking IDs
 * from per-app ownership to the shared Business Details record.
 */
class BusinessIdentityConsolidationTest extends TestCase
{
    use RefreshDatabase;

    /** The 13 keys moved by this change. */
    private const MOVED = [
        'site_tagline', 'logo', 'logo_dark', 'favicon', 'og_image',
        'primary_color', 'default_item_image',
        'show_social_links', 'social_instagram', 'social_facebook', 'social_tiktok',
        'google_analytics_id', 'google_tag_manager_id',
    ];

    private function actingAsOwner(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $user = User::create([
            'name' => 'Business Owner',
            'email' => 'identity-consolidation@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);
    }

    public function test_every_moved_key_is_owned_by_business_details(): void
    {
        foreach (self::MOVED as $key) {
            $this->assertTrue(
                OpsOwnedContent::resolvesFromBusinessDetails($key),
                "[{$key}] must resolve from the Business Details record",
            );
            $this->assertTrue(
                OpsOwnedContent::isWriteForbidden($key),
                "[{$key}] must not be writable through Content & Branding",
            );
            $this->assertTrue(
                OpsOwnedContent::isHiddenFromContentHub($key),
                "[{$key}] must not be listed under Website or Order App content",
            );
        }
    }

    public function test_both_apps_resolve_the_shared_value_and_ignore_stale_app_rows(): void
    {
        foreach (self::MOVED as $key) {
            SiteSetting::set($key, "shared-{$key}", 'shared');
            SiteSetting::set($key, "website-{$key}", 'website');
            SiteSetting::set($key, "order-{$key}", 'order_app');
        }
        ContentResolver::bust();

        foreach (self::MOVED as $key) {
            $this->assertSame("shared-{$key}", ContentResolver::for('website')->get($key), $key);
            $this->assertSame("shared-{$key}", ContentResolver::for('order_app')->get($key), $key);
        }
    }

    public function test_moved_keys_are_absent_from_the_admin_content_list(): void
    {
        $this->actingAsOwner();
        $blocks = collect($this->getJson('/api/admin/content')->assertOk()->json('blocks'));

        foreach (self::MOVED as $key) {
            $this->assertNull(
                $blocks->firstWhere('key', $key),
                "[{$key}] must not appear under Website or Order App content",
            );
        }
    }

    public function test_business_details_can_edit_every_moved_key(): void
    {
        $this->actingAsOwner();

        $editable = collect(
            $this->getJson('/api/admin/business-details')->assertOk()->json('sections')
        )->flatMap(fn (array $s) => array_column($s['fields'], 'key'))->all();

        foreach (self::MOVED as $key) {
            $this->assertContains($key, $editable, "[{$key}] must be editable in Business Details");
        }
    }

    public function test_migration_backfills_shared_from_the_website_value(): void
    {
        // The failure this guards: shared empty + per-app rows now ignored =
        // the logo silently vanishes from the live site after deploy.
        SiteSetting::query()->where('key', 'logo')->delete();
        SiteSetting::set('logo', '/storage/site/website-logo.png', 'website');
        SiteSetting::set('logo', '/storage/site/order-logo.png', 'order_app');
        SiteSetting::query()->where('key', 'social_instagram')->delete();
        SiteSetting::set('social_instagram', 'https://instagram.com/bng', 'order_app');
        SiteSetting::bust();
        ContentResolver::bust();

        $this->assertNull(SiteSetting::getScoped('logo', 'shared'));

        $this->runConsolidationMigration();

        // Website value wins — it is the one the owner has been editing.
        $this->assertSame('/storage/site/website-logo.png', SiteSetting::getScoped('logo', 'shared'));
        // Falls back to order_app when the website never had one.
        $this->assertSame('https://instagram.com/bng', SiteSetting::getScoped('social_instagram', 'shared'));

        $this->assertSame('/storage/site/website-logo.png', ContentResolver::for('website')->get('logo'));
        $this->assertSame('/storage/site/website-logo.png', ContentResolver::for('order_app')->get('logo'));
    }

    public function test_migration_never_overwrites_an_existing_shared_value(): void
    {
        SiteSetting::set('logo', '/storage/site/invoice-logo.png', 'shared');
        SiteSetting::set('logo', '/storage/site/website-logo.png', 'website');
        SiteSetting::bust();

        $this->runConsolidationMigration();

        $this->assertSame('/storage/site/invoice-logo.png', SiteSetting::getScoped('logo', 'shared'));
    }

    private function runConsolidationMigration(): void
    {
        $migration = require base_path(
            'database/migrations/2026_08_14_090000_consolidate_business_identity_into_shared.php'
        );
        $migration->up();
        SiteSetting::bust();
        ContentResolver::bust();
    }

    public function test_the_public_website_still_receives_the_logo(): void
    {
        // The failure this guards against: shared empty + app rows ignored =
        // logo silently falls back to the registry default on the live site.
        SiteSetting::set('logo', '/storage/site/business-logo.png', 'shared');
        ContentResolver::bust();

        $content = $this->getJson('/api/content?app=website&locale=en')
            ->assertOk()->json('content');

        $this->assertSame('/storage/site/business-logo.png', $content['logo'] ?? null);
    }
}
