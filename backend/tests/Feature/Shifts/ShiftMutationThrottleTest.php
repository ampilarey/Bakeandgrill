<?php

declare(strict_types=1);

namespace Tests\Feature\Shifts;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ShiftMutationThrottleTest extends TestCase
{
    use RefreshDatabase;

    private const PLAIN_MESSAGE = 'Too many shift open or close attempts. Wait about a minute and try again.';

    private User $cashier;

    protected function setUp(): void
    {
        parent::setUp();

        PermissionCatalogSync::sync();

        $role = Role::firstOrCreate(
            ['slug' => 'cashier'],
            ['name' => 'Cashier', 'description' => '', 'is_active' => true],
        );

        $this->cashier = User::create([
            'name' => 'Shift Throttle Cashier',
            'email' => 'shift-throttle@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->cashier->grantPermission('pos.open_shift');

        Sanctum::actingAs($this->cashier, ['staff']);
    }

    public function test_more_than_five_consecutive_shift_opens_are_not_blocked(): void
    {
        for ($i = 0; $i < 6; $i++) {
            $response = $this->postJson('/api/shifts/open', ['opening_cash' => 100]);
            $this->assertNotSame(
                429,
                $response->status(),
                "Attempt {$i} should not hit the old 5/minute ceiling",
            );
            $this->assertContains(
                $response->status(),
                [201, 422],
                "Unexpected status on attempt {$i}",
            );
        }
    }

    public function test_pos_shift_limiter_returns_plain_language_429_at_ceiling(): void
    {
        $hit429 = null;

        // Named limiter is 60/minute — burn past it.
        for ($i = 0; $i < 70; $i++) {
            $response = $this->postJson('/api/shifts/open', ['opening_cash' => 100]);
            if ($response->status() === 429) {
                $hit429 = $response;
                break;
            }
            $this->assertContains(
                $response->status(),
                [201, 422],
                "Unexpected status before throttle on attempt {$i}",
            );
        }

        $this->assertNotNull($hit429, 'Expected pos-shift limiter to return 429 at the new ceiling');
        $hit429->assertJsonPath('message', self::PLAIN_MESSAGE);
        $this->assertNotSame(
            'Too Many Attempts.',
            $hit429->json('message'),
            'Must not return Laravel\'s bare default 429 body',
        );
    }
}
