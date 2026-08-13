<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\Blocks\HomeLayoutMigrator;
use App\Domains\Content\Blocks\PageBlockRepository;
use App\Domains\Content\ContentIntegrityReport;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\PageBlock;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContentIntegrityReportTest extends TestCase
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
            'name' => 'Integrity Owner',
            'email' => 'integrity@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);
    }

    public function test_integrity_endpoint_requires_auth(): void
    {
        $this->getJson('/api/admin/content/integrity')->assertUnauthorized();
    }

    public function test_integrity_report_lists_all_surfaces(): void
    {
        $this->actingAsOwner();

        $res = $this->getJson('/api/admin/content/integrity')->assertOk()->json();

        $this->assertArrayHasKey('surfaces', $res);
        $this->assertArrayHasKey('issues', $res);
        $this->assertArrayHasKey('needs_review', $res);
        $this->assertSame(14, $res['summary']['surface_count'] ?? null);
        $ids = collect($res['surfaces'])->pluck('id')->all();
        $this->assertContains('website.mobile.header', $ids);
        $this->assertContains('order_app.desktop.home', $ids);
        $this->assertNotContains('website.desktop.bottom_navigation', $ids);

        $generated = ContentIntegrityReport::generate();
        $this->assertSame(14, $generated['summary']['surface_count']);
    }

    public function test_integrity_reports_legacy_singleton_duplicates_without_deleting(): void
    {
        $this->actingAsOwner();
        HomeLayoutMigrator::migrate();
        PageBlockRepository::bustAll();

        // Seed a second prayer_bar on website mobile header (legacy duplicate).
        PageBlock::query()->create([
            'app' => 'website',
            'page' => 'home',
            'block_type' => 'prayer_bar',
            'position' => 90,
            'is_enabled' => true,
            'content_mode' => 'own',
            'settings' => [
                'show_desktop' => true,
                'show_mobile' => true,
                'placement_desktop' => 'header',
                'placement_mobile' => 'header',
            ],
        ]);
        PageBlockRepository::bustAll();

        $before = PageBlock::query()
            ->where('app', 'website')
            ->where('block_type', 'prayer_bar')
            ->count();
        $this->assertGreaterThanOrEqual(2, $before);

        $report = ContentIntegrityReport::generate();
        $dupes = collect($report['issues'])->where('code', 'singleton_duplicate_surface')->values();
        $this->assertTrue($dupes->isNotEmpty(), 'Expected singleton_duplicate_surface issue');
        $this->assertStringContainsString('Duplicate components need review', (string) $dupes->first()['message']);
        $this->assertArrayHasKey('block_ids', $dupes->first()['meta'] ?? []);

        $after = PageBlock::query()
            ->where('app', 'website')
            ->where('block_type', 'prayer_bar')
            ->count();
        $this->assertSame($before, $after, 'Integrity must not delete duplicate rows');

        // Live surface path keeps a single prayer_bar for customers.
        $live = PageBlockRepository::forSurface('website', 'mobile', 'header');
        $this->assertSame(
            1,
            $live->where('block_type', 'prayer_bar')->count(),
            'Public surface render must show only one singleton instance',
        );
    }
}
