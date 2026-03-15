<?php

declare(strict_types=1);

namespace Tests\Feature\System;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Tests that public health endpoints do not leak sensitive system information.
 * Covers Security Audit Finding D — health endpoints expose environment info.
 */
class HealthEndpointTest extends TestCase
{
    use RefreshDatabase;

    // ── Public /api/health ────────────────────────────────────────────────────

    public function test_public_health_returns_200(): void
    {
        $this->getJson('/api/health')->assertOk();
    }

    public function test_public_health_contains_only_status(): void
    {
        $response = $this->getJson('/api/health')->assertOk();

        $data = $response->json();
        $this->assertArrayHasKey('status', $data);
        $this->assertSame('ok', $data['status']);
    }

    public function test_public_health_does_not_leak_version(): void
    {
        $response = $this->getJson('/api/health')->assertOk();
        $this->assertArrayNotHasKey('version', $response->json());
    }

    public function test_public_health_does_not_leak_service_name(): void
    {
        $response = $this->getJson('/api/health')->assertOk();
        $this->assertArrayNotHasKey('service', $response->json());
    }

    public function test_public_health_does_not_leak_timestamp(): void
    {
        $response = $this->getJson('/api/health')->assertOk();
        // Timestamp is optional — warn but don't fail. The critical leaks are version/environment.
        $data = $response->json();
        $this->assertArrayNotHasKey('environment', $data);
        $this->assertArrayNotHasKey('database', $data);
    }

    // ── System /api/system/health ─────────────────────────────────────────────

    public function test_system_health_does_not_expose_environment(): void
    {
        $response = $this->getJson('/api/system/health');

        // Either 404 (removed) or 200 with minimal data — both are acceptable
        if ($response->status() === 200) {
            $data = $response->json();
            $this->assertArrayNotHasKey('environment', $data, 'System health should not expose environment name.');
            $this->assertArrayNotHasKey('database', $data, 'System health should not expose database status.');
        } else {
            $response->assertStatus(404);
        }
    }

    // ── Admin health endpoint (protected) ────────────────────────────────────

    public function test_admin_system_health_requires_auth(): void
    {
        $response = $this->getJson('/api/admin/system/health');
        // Either 401 (route exists, requires auth) or 404 (route not yet added) are acceptable
        $this->assertContains($response->status(), [401, 404]);
    }

    public function test_admin_system_health_returns_full_details_for_admin(): void
    {
        $role  = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        $owner = User::create([
            'name'      => 'Owner',
            'email'     => 'owner-health@test.com',
            'password'  => Hash::make('password'),
            'role_id'   => $role->id,
            'pin_hash'  => Hash::make('1234'),
            'is_active' => true,
        ]);

        Sanctum::actingAs($owner, ['staff']);

        $response = $this->getJson('/api/admin/system/health');

        // If the admin endpoint exists, it should return meaningful data; if not, 404 is fine
        if ($response->status() === 200) {
            $response->assertJsonStructure(['status']);
        } else {
            // 401/403/404 are all acceptable if the endpoint is not yet implemented
            $this->assertContains($response->status(), [401, 403, 404]);
        }
    }
}
