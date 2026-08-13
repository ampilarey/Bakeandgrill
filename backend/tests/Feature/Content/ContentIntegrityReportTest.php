<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentIntegrityReport;
use App\Domains\Permissions\PermissionCatalogSync;
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
}
