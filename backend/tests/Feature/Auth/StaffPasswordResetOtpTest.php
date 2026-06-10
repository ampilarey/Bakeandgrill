<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Role;
use App\Models\User;
use App\Services\StaffUserLookup;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class StaffPasswordResetOtpTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => 'Owner', 'is_active' => true],
        );

        $this->user = User::create([
            'name' => 'Reset User',
            'email' => 'reset@test.local',
            'phone' => '+9607771234',
            'password' => Hash::make('old-password'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);
    }

    #[Test]
    public function five_wrong_otp_guesses_invalidate_the_code(): void
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);

        $otp = '123456';
        $identityKey = StaffUserLookup::canonicalIdentityKey('+9607771234');
        Cache::put('staff-pwd-reset:' . $identityKey, Hash::make($otp), now()->addMinutes(10));

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/staff/password/reset-verify', [
                'phone' => '+9607771234',
                'otp' => '000000',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ])->assertUnprocessable();
        }

        $this->postJson('/api/auth/staff/password/reset-verify', [
            'phone' => '7771234',
            'otp' => $otp,
            'password' => 'new-password',
            'password_confirmation' => 'new-password',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['otp']);
    }

    #[Test]
    public function successful_verify_clears_the_attempt_counter(): void
    {
        $otp = '654321';
        $identityKey = StaffUserLookup::canonicalIdentityKey('7771234');
        $attemptKey = 'staff-pwd-reset-attempts:' . $identityKey;
        Cache::put('staff-pwd-reset:' . $identityKey, Hash::make($otp), now()->addMinutes(10));
        Cache::put($attemptKey, 3, now()->addMinutes(10));

        $this->postJson('/api/auth/staff/password/reset-verify', [
            'phone' => '7771234',
            'otp' => $otp,
            'password' => 'new-password',
            'password_confirmation' => 'new-password',
        ])->assertOk();

        $this->assertNull(Cache::get($attemptKey));
    }
}
