<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class StaffIdentityKeyTest extends TestCase
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
            'name' => 'Key User',
            'email' => 'key-user@test.local',
            'phone' => '+9607771234',
            'password' => Hash::make('password123'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        RateLimiter::clear('staff-pin:phone:7771234:127.0.0.1');
    }

    #[Test]
    public function password_reset_otp_requested_with_formatted_phone_verifies_with_local_digits(): void
    {
        Cache::flush();

        $this->mock(\App\Domains\Notifications\Services\SmsService::class, function ($mock): void {
            $mock->shouldReceive('send')->once();
        });

        $this->postJson('/api/auth/staff/password/reset-request', [
            'phone' => '+960 777-1234',
        ])->assertOk();

        $cacheKey = 'staff-pwd-reset:phone:7771234';
        $this->assertNotNull(Cache::get($cacheKey));

        $otp = '112233';
        Cache::put($cacheKey, Hash::make($otp), now()->addMinutes(10));

        $this->postJson('/api/auth/staff/password/reset-verify', [
            'phone' => '7771234',
            'otp' => $otp,
            'password' => 'new-password-1',
            'password_confirmation' => 'new-password-1',
        ])->assertOk();
    }

    #[Test]
    public function pin_rate_limit_is_shared_across_phone_format_variants(): void
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/staff/pin-login', [
                'username' => '+9607771234',
                'pin' => '9999',
            ])->assertUnprocessable();
        }

        $this->postJson('/api/auth/staff/pin-login', [
            'username' => '7771234',
            'pin' => '9999',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['pin']);
    }
}
