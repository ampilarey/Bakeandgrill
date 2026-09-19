<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpFoundation\Cookie;
use Tests\TestCase;

/**
 * Owner, 2026-09-19: "In mobile pwa saved app in iphone, in admin app, i
 * have to login every time i open."
 *
 * The admin signed in with a session cookie alone, which the server forgets
 * after SESSION_LIFETIME minutes (120 unless set) of not being used. A phone
 * that opens the app a few times a day was past that every time. The sign-in
 * now also sets a remember cookie, so an expired session is rebuilt from it
 * without a password — until the device logs out, or "Log out everywhere"
 * cycles the token.
 */
class AdminRememberMeTest extends TestCase
{
    use RefreshDatabase;

    private function owner(): User
    {
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);

        return User::create([
            'name' => 'Owner',
            'email' => 'owner@example.com',
            'phone' => '+9607771234',
            'password' => Hash::make('password123'),
            'pin_hash' => Hash::make('4321'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);
    }

    /**
     * Sanctum only runs the cookie and session middleware for a request that
     * says it came from the SPA, so every request here carries the admin's
     * Referer the way a browser does — and, being JSON requests, they only
     * send cookies at all with credentials switched on.
     */
    private function fromAdmin(): static
    {
        return $this->withCredentials()->withHeader('Referer', 'http://localhost:8000/admin/');
    }

    private function recallerCookie(\Illuminate\Testing\TestResponse $response): ?Cookie
    {
        $name = Auth::guard('web')->getRecallerName();
        foreach ($response->headers->getCookies() as $cookie) {
            if ($cookie->getName() === $name && $cookie->getValue() !== '' && $cookie->getValue() !== null) {
                return $cookie;
            }
        }

        return null;
    }

    public function test_an_admin_login_sets_a_thirty_day_remember_cookie(): void
    {
        $this->owner();

        $login = $this->fromAdmin()->postJson('/api/auth/staff/login', ['phone' => '+9607771234', 'password' => 'password123'])->assertOk();

        $cookie = $this->recallerCookie($login);
        $this->assertNotNull($cookie, 'no remember cookie on the login response');
        $this->assertGreaterThan(now()->addDays(29)->getTimestamp(), $cookie->getExpiresTime());
        $this->assertLessThan(now()->addDays(31)->getTimestamp(), $cookie->getExpiresTime());
        $this->assertTrue($cookie->isHttpOnly());
    }

    public function test_the_pin_login_for_admin_is_remembered_too(): void
    {
        $this->owner();

        $login = $this->fromAdmin()->postJson('/api/auth/staff/pin-login', ['username' => '+9607771234', 'pin' => '4321', 'intent' => 'admin'])->assertOk();

        $this->assertNotNull($this->recallerCookie($login));
    }

    public function test_an_expired_session_is_rebuilt_from_the_remember_cookie(): void
    {
        $user = $this->owner();
        $login = $this->fromAdmin()->postJson('/api/auth/staff/login', ['phone' => '+9607771234', 'password' => 'password123'])->assertOk();
        $cookie = $this->recallerCookie($login);

        // The session is gone — what the server does after SESSION_LIFETIME —
        // and the phone presents only the remember cookie it kept.
        $this->flushSession();
        $this->app['auth']->forgetGuards();

        $this->fromAdmin()->withUnencryptedCookie($cookie->getName(), (string) $cookie->getValue())
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('user.id', $user->id);
    }

    public function test_without_the_cookie_an_expired_session_is_a_login_again(): void
    {
        $this->owner();
        $this->fromAdmin()->postJson('/api/auth/staff/login', ['phone' => '+9607771234', 'password' => 'password123'])->assertOk();

        $this->flushSession();
        $this->app['auth']->forgetGuards();

        $this->fromAdmin()->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_logging_out_kills_the_remember_cookie_everywhere(): void
    {
        $this->owner();
        $login = $this->fromAdmin()->postJson('/api/auth/staff/login', ['phone' => '+9607771234', 'password' => 'password123'])->assertOk();
        $cookie = $this->recallerCookie($login);

        $this->fromAdmin()->postJson('/api/auth/logout')->assertOk();

        // The token behind the cookie was cycled, so a copy kept on another
        // device is worthless.
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->fromAdmin()->withUnencryptedCookie($cookie->getName(), (string) $cookie->getValue())
            ->getJson('/api/auth/me')
            ->assertStatus(401);
    }

    public function test_remembering_can_be_switched_off(): void
    {
        config(['auth.staff_remember_days' => 0]);
        $this->owner();

        $login = $this->fromAdmin()->postJson('/api/auth/staff/login', ['phone' => '+9607771234', 'password' => 'password123'])->assertOk();

        $this->assertNull($this->recallerCookie($login));
    }
}
