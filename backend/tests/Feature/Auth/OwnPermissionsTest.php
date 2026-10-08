<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Domains\Permissions\PermissionCatalogSync;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-08: "If the manager has given the permission he must see the
 * permission." A manager could not open the role editor, so Settings → Roles &
 * permissions showed them nothing about their own access.
 */
class OwnPermissionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    public function test_a_manager_sees_their_own_access_by_name(): void
    {
        Sanctum::actingAs($this->makeManager(), ['staff']);

        $res = $this->getJson('/api/auth/me/permissions')->assertOk()->assertJsonPath('role', 'manager');

        $bySlug = collect($res->json('permissions'))->keyBy('slug');
        $this->assertTrue($bySlug->has('settings.update'));
        $this->assertNotSame('', (string) $bySlug['settings.update']['name']);
        $this->assertNotSame('', (string) $bySlug['settings.update']['group']);
        // Only what they hold: the role editor stays the owner's.
        $this->assertFalse($bySlug->has('roles_permissions.manage'));
    }

    public function test_a_cashier_sees_only_their_own_too(): void
    {
        Sanctum::actingAs($this->makeStaff('staff'), ['staff']);

        $slugs = collect($this->getJson('/api/auth/me/permissions')->assertOk()->json('permissions'))->pluck('slug');

        $this->assertTrue($slugs->contains('pos.access'));
        $this->assertFalse($slugs->contains('settings.update'));
    }

    public function test_it_needs_a_signed_in_staff_member(): void
    {
        $this->getJson('/api/auth/me/permissions')->assertUnauthorized();
    }
}
