<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Domains\Permissions\PermissionCatalog;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Http\Middleware\ValidateCsrfToken;
use App\Models\Device;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * POS/admin use Bearer tokens on stateful domains. A stale XSRF cookie must not
 * block authenticated mutations (CSRF is for cookie sessions, not PAT auth).
 */
class BearerCsrfBypassTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function sanctum_stateful_stack_uses_app_csrf_middleware(): void
    {
        $this->assertSame(
            ValidateCsrfToken::class,
            config('sanctum.middleware.validate_csrf_token'),
        );
    }

    #[Test]
    public function open_shift_succeeds_with_bearer_and_wrong_xsrf_header(): void
    {
        PermissionCatalogSync::sync();

        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );

        $user = User::create([
            'name' => 'CSRF Staff',
            'email' => 'csrf-staff@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        foreach (PermissionCatalog::staffSlugs() as $slug) {
            $user->grantPermission($slug);
        }

        $device = Device::create([
            'name' => 'POS CSRF',
            'identifier' => 'pos-csrf-bypass-test',
            'type' => 'pos',
            'is_active' => true,
        ]);

        $token = $user->createToken('pos-' . $user->id, ['staff'])->plainTextToken;

        // Simulate a browser on a Sanctum stateful domain with a stale XSRF cookie/header.
        $response = $this
            ->withHeader('Authorization', 'Bearer ' . $token)
            ->withHeader('X-Device-Identifier', $device->identifier)
            ->withHeader('Origin', 'https://test.bakeandgrill.mv')
            ->withHeader('Referer', 'https://test.bakeandgrill.mv/pos/')
            ->withHeader('X-XSRF-TOKEN', 'definitely-not-a-valid-csrf-token')
            ->postJson('/api/shifts/open', ['opening_cash' => 0]);

        // Must not be 419 CSRF mismatch — Bearer auth skips CSRF.
        $this->assertNotSame(419, $response->status(), (string) $response->getContent());
        $response->assertCreated();
    }
}
