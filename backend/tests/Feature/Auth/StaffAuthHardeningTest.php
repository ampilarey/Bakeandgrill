<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use App\Rules\StrongStaffPin;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Findings from the sign-in audit, 2026-08-19.
 *
 *   - nothing recorded a failed sign-in, so "did someone try the admin panel
 *     last night" had no answer
 *   - two messages confirmed an account existed
 *   - 1234 and 0000 were legal staff PINs
 *   - any device with a correct PIN could open a till
 *   - a lost phone's token lived until its 72h TTL
 */
class StaffAuthHardeningTest extends TestCase
{
    use RefreshDatabase;

    private function staff(array $attrs = []): User
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );

        return User::create(array_merge([
            'name' => 'Audit Staff',
            'email' => 'audit-staff@test.local',
            'phone' => '7811111',
            'password' => Hash::make('correct-horse'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('8351'),
            'is_active' => true,
        ], $attrs));
    }

    // ── Failed sign-ins are recorded ──────────────────────────────────────

    public function test_a_wrong_pin_is_written_to_the_audit_log(): void
    {
        $user = $this->staff();

        $this->postJson('/api/auth/staff/pin-login', [
            'username' => '7811111',
            'pin' => '9999',
        ])->assertStatus(422);

        $entry = AuditLog::query()->where('action', 'auth.staff_login_failed')->latest('id')->first();

        $this->assertNotNull($entry, 'a rejected sign-in must leave a trace');
        $this->assertSame($user->id, $entry->model_id);
        $this->assertSame('wrong_pin', $entry->meta['reason']);
        $this->assertNotNull($entry->ip_address, 'without the IP the record cannot be acted on');
    }

    public function test_an_unknown_identity_is_recorded_without_an_account(): void
    {
        $this->postJson('/api/auth/staff/pin-login', [
            'username' => '7899999',
            'pin' => '1111',
        ])->assertStatus(422);

        $entry = AuditLog::query()->where('action', 'auth.staff_login_failed')->latest('id')->first();

        $this->assertNotNull($entry);
        $this->assertNull($entry->model_id);
        $this->assertSame('unknown_identity', $entry->meta['reason']);
    }

    public function test_a_failed_admin_password_is_recorded_as_the_admin_surface(): void
    {
        $this->staff();

        $this->postJson('/api/auth/staff/login', [
            'phone' => '7811111',
            'password' => 'wrong-password',
        ])->assertStatus(422);

        $entry = AuditLog::query()->where('action', 'auth.staff_login_failed')->latest('id')->first();

        $this->assertSame('admin', $entry->meta['surface']);
        $this->assertSame('wrong_password', $entry->meta['reason']);
    }

    public function test_a_lockout_is_recorded_separately_from_a_bad_attempt(): void
    {
        // The tripped limiter is the event worth alerting on.
        $this->staff();

        for ($i = 0; $i < 12; $i++) {
            $this->postJson('/api/auth/staff/pin-login', ['username' => '7811111', 'pin' => '9999']);
        }

        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.staff_login_locked']);
    }

    // ── The messages give nothing away ────────────────────────────────────

    public function test_the_admin_login_does_not_reveal_an_account_with_no_password(): void
    {
        // The password attribute is cast 'hashed', so User::create(['password'
        // => '']) stores a bcrypt hash OF the empty string and
        // staffHasAdminPassword() reports true — the branch under test would
        // never be reached. Write the empty hash past the cast.
        // forceFill still runs the cast, so go around Eloquent entirely.
        $user = $this->staff();
        DB::table('users')->where('id', $user->id)->update(['password' => '']);
        $this->assertSame('', $user->fresh()->getAuthPassword(), 'precondition: no admin password');

        $noPassword = $this->postJson('/api/auth/staff/login', [
            'phone' => '7811111',
            'password' => 'anything-at-all',
        ])->assertStatus(422);

        $unknown = $this->postJson('/api/auth/staff/login', [
            'phone' => '7800000',
            'password' => 'anything-at-all',
        ])->assertStatus(422);

        $this->assertSame(
            (string) $unknown->json('errors.phone.0'),
            (string) $noPassword->json('errors.phone.0'),
        );
    }

    // ── Weak PINs are refused ─────────────────────────────────────────────

    public static function weakPins(): array
    {
        return [
            'the first guess' => ['1234'],
            'all zeroes' => ['0000'],
            'one repeated digit' => ['7777'],
            'counting down' => ['4321'],
            'a birth year' => ['1987'],
            'this century' => ['2019'],
            'six in a row' => ['123456'],
        ];
    }

    /** @dataProvider weakPins */
    public function test_a_guessable_pin_is_refused(string $pin): void
    {
        $v = Validator::make(['pin' => $pin], ['pin' => [new StrongStaffPin()]]);
        $this->assertTrue($v->fails(), "{$pin} should not be allowed as a staff PIN");
    }

    public function test_an_ordinary_pin_is_still_allowed(): void
    {
        // The rule must not be so strict that staff cannot choose anything.
        foreach (['8351', '4907', '2648', '739104'] as $pin) {
            $v = Validator::make(['pin' => $pin], ['pin' => [new StrongStaffPin()]]);
            $this->assertFalse($v->fails(), "{$pin} is a reasonable PIN and should be allowed");
        }
    }

    public function test_existing_pins_are_not_invalidated(): void
    {
        // The rule governs setting a PIN, never checking one — nobody is
        // locked out of a till by this change.
        $this->staff(['pin_hash' => Hash::make('1234')]);

        $this->postJson('/api/auth/staff/pin-login', [
            'username' => '7811111',
            'pin' => '1234',
        ])->assertOk();
    }

    // ── An unknown till has to be let in ──────────────────────────────────

    public function test_device_approval_is_required_by_default(): void
    {
        // Left off, a correct PIN from any laptop opened a till.
        // Assert the code default, not the resolved value: CI copies
        // .env.example which sets POS_STRICT_DEVICE_APPROVAL=false for the café.
        $src = (string) file_get_contents(config_path('pos.php'));
        $this->assertMatchesRegularExpression(
            "/env\(\s*'POS_STRICT_DEVICE_APPROVAL'\s*,\s*true\s*\)/",
            $src,
            'strict device approval must default ON',
        );
    }

    // ── A lost phone can be cut off ───────────────────────────────────────

    public function test_signing_out_everywhere_revokes_every_token(): void
    {
        $user = $this->staff();
        $user->createToken('till-1', ['staff']);
        $user->createToken('phone', ['staff']);
        $this->assertSame(2, $user->tokens()->count());

        Sanctum::actingAs($user, ['staff']);
        $this->postJson('/api/auth/logout-everywhere')
            ->assertOk()
            ->assertJsonPath('revoked', 2);

        $this->assertSame(0, $user->fresh()->tokens()->count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.staff_tokens_revoked']);
    }

    public function test_ordinary_logout_still_leaves_other_devices_signed_in(): void
    {
        // The two are different tools; logout must not become a panic button.
        $user = $this->staff();
        $user->createToken('other-till', ['staff']);

        Sanctum::actingAs($user, ['staff']);
        $this->postJson('/api/auth/logout')->assertOk();

        $this->assertSame(1, $user->fresh()->tokens()->count());
    }
}
