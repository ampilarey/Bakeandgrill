<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use App\Services\Totp;
use App\Services\TwoFactorService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The fifth finding from the sign-in audit: a stolen admin password was the
 * whole of the admin panel.
 *
 * Half of these tests are about the second factor working. The other half are
 * about it not becoming a trap — a one-owner restaurant with no help desk can
 * be permanently locked out of its own takings by a lost phone, so the ways
 * back in are tested at least as hard as the gate itself.
 */
class TwoFactorTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'correct-horse-battery';

    private function admin(array $attrs = []): User
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );

        return User::create(array_merge([
            'name' => 'Audit Admin',
            'email' => 'audit-admin@test.local',
            'phone' => '7811111',
            'password' => Hash::make(self::PASSWORD),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('8351'),
            'is_active' => true,
        ], $attrs));
    }

    /** An account already through enrolment, with known codes. */
    private function enrolled(array $attrs = []): array
    {
        $user = $this->admin($attrs);
        $secret = Totp::generateSecret();

        $user->forceFill([
            'two_factor_secret' => $secret,
            'two_factor_confirmed_at' => now(),
        ])->save();

        $codes = app(TwoFactorService::class)->regenerateRecoveryCodes($user->fresh());

        return [$user->fresh(), $secret, $codes];
    }

    private function signIn(): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/auth/staff/login', [
            'phone' => '7811111',
            'password' => self::PASSWORD,
        ]);
    }

    // ── The gate ──────────────────────────────────────────────────────────

    public function test_an_account_without_two_factor_signs_in_exactly_as_before(): void
    {
        // The migration must change nothing for anyone who has not enrolled.
        $this->admin();

        $this->signIn()
            ->assertOk()
            ->assertJsonPath('message', 'Login successful')
            ->assertJsonMissingPath('two_factor_required');

        $this->assertAuthenticated('web');
    }

    public function test_a_correct_password_alone_no_longer_signs_in_an_enrolled_account(): void
    {
        // This is the finding: the password was the whole of the admin panel.
        [$user] = $this->enrolled();

        $this->signIn()
            ->assertOk()
            ->assertJsonPath('two_factor_required', true)
            ->assertJsonStructure(['challenge']);

        $this->assertGuest('web');
        $this->assertNull($user->fresh()->last_login_at, 'a half-finished sign-in is not a login');
    }

    public function test_the_code_from_the_phone_completes_the_sign_in(): void
    {
        [, $secret] = $this->enrolled();

        $challenge = $this->signIn()->json('challenge');

        $this->postJson('/api/auth/staff/two-factor-challenge', [
            'challenge' => $challenge,
            'code' => Totp::codeAt($secret, time()),
        ])
            ->assertOk()
            ->assertJsonPath('message', 'Login successful')
            ->assertJsonPath('user.role', 'owner');

        $this->assertAuthenticated('web');
    }

    public function test_the_pin_route_into_the_admin_panel_is_gated_too(): void
    {
        // A second door into the same room is not a second factor.
        $this->enrolled();

        $this->postJson('/api/auth/staff/pin-login', [
            'username' => '7811111',
            'pin' => '8351',
            'intent' => 'admin',
        ])
            ->assertOk()
            ->assertJsonPath('two_factor_required', true);

        $this->assertGuest('web');
    }

    public function test_the_till_is_not_gated(): void
    {
        // Deliberate: a cook mid-service is not reading a code off a phone,
        // and the POS has device approval and a shift behind it.
        $this->enrolled();

        $this->postJson('/api/auth/staff/pin-login', [
            'username' => '7811111',
            'pin' => '8351',
        ])
            ->assertOk()
            ->assertJsonStructure(['token']);
    }

    // ── Guessing at the code ──────────────────────────────────────────────

    public function test_a_wrong_code_is_refused_and_recorded(): void
    {
        [$user] = $this->enrolled();
        $challenge = $this->signIn()->json('challenge');

        $this->postJson('/api/auth/staff/two-factor-challenge', [
            'challenge' => $challenge,
            'code' => '000000',
        ])->assertStatus(422);

        $this->assertGuest('web');

        $entry = AuditLog::query()->where('action', 'auth.staff_login_failed')->latest('id')->first();
        $this->assertSame('wrong_two_factor_code', $entry->meta['reason']);
        // Worth telling apart from a wrong password: whoever this is already
        // had the password.
        $this->assertSame('admin_two_factor', $entry->meta['surface']);
        $this->assertSame($user->id, $entry->model_id);
    }

    public function test_a_challenge_is_burned_after_a_handful_of_wrong_codes(): void
    {
        // Otherwise one password step buys unlimited guesses at six digits.
        [, $secret] = $this->enrolled();
        $challenge = $this->signIn()->json('challenge');

        for ($i = 0; $i < (int) config('twofactor.max_attempts_per_challenge'); $i++) {
            $this->postJson('/api/auth/staff/two-factor-challenge', [
                'challenge' => $challenge,
                'code' => '000000',
            ])->assertStatus(422);
        }

        // Even the right code no longer works on a burned challenge.
        $this->postJson('/api/auth/staff/two-factor-challenge', [
            'challenge' => $challenge,
            'code' => Totp::codeAt($secret, time()),
        ])->assertStatus(422);

        $this->assertGuest('web');
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.staff_login_failed']);
    }

    public function test_a_code_cannot_be_used_twice(): void
    {
        // A code lives for 30 seconds. Without this, one read over a shoulder
        // — or lifted in transit — is usable for the rest of its window.
        [, $secret] = $this->enrolled();
        $code = Totp::codeAt($secret, time());

        $first = $this->signIn()->json('challenge');
        $this->postJson('/api/auth/staff/two-factor-challenge', ['challenge' => $first, 'code' => $code])
            ->assertOk();

        $this->post('/api/auth/logout');

        $second = $this->signIn()->json('challenge');
        $this->postJson('/api/auth/staff/two-factor-challenge', ['challenge' => $second, 'code' => $code])
            ->assertStatus(422);
    }

    public function test_a_made_up_challenge_gets_nowhere(): void
    {
        [, $secret] = $this->enrolled();

        $this->postJson('/api/auth/staff/two-factor-challenge', [
            'challenge' => str_repeat('a', 64),
            'code' => Totp::codeAt($secret, time()),
        ])->assertStatus(422);

        $this->assertGuest('web');
    }

    public function test_clearing_someones_two_factor_mid_challenge_does_not_let_the_challenge_through(): void
    {
        // An owner resetting a compromised account must not leave an open
        // challenge that still completes.
        [$user, $secret] = $this->enrolled();
        $challenge = $this->signIn()->json('challenge');

        app(TwoFactorService::class)->disable($user->fresh());

        $this->postJson('/api/auth/staff/two-factor-challenge', [
            'challenge' => $challenge,
            'code' => Totp::codeAt($secret, time()),
        ])->assertStatus(422);

        $this->assertGuest('web');
    }

    public function test_a_deactivated_account_cannot_finish_a_challenge(): void
    {
        [$user, $secret] = $this->enrolled();
        $challenge = $this->signIn()->json('challenge');

        $user->forceFill(['is_active' => false])->save();

        $this->postJson('/api/auth/staff/two-factor-challenge', [
            'challenge' => $challenge,
            'code' => Totp::codeAt($secret, time()),
        ])->assertStatus(422);

        $this->assertGuest('web');
    }

    // ── Enrolment ─────────────────────────────────────────────────────────

    public function test_setup_then_confirm_turns_it_on_and_hands_over_recovery_codes(): void
    {
        $user = $this->admin();
        Sanctum::actingAs($user, ['staff']);

        $setup = $this->postJson('/api/auth/two-factor/setup')->assertOk();
        $this->assertStringStartsWith('otpauth://totp/', $setup->json('uri'));

        // Not enforced until a code has been proved — otherwise a failed scan
        // locks the account out of the panel it would enrol from.
        $this->assertFalse($user->fresh()->hasTwoFactorEnabled());

        $secret = $user->fresh()->two_factor_secret;
        $confirm = $this->postJson('/api/auth/two-factor/confirm', [
            'code' => Totp::codeAt($secret, time()),
        ])->assertOk();

        $this->assertTrue($user->fresh()->hasTwoFactorEnabled());
        $this->assertCount(TwoFactorService::RECOVERY_CODE_COUNT, $confirm->json('recovery_codes'));
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.two_factor_enabled']);
    }

    public function test_a_wrong_code_at_confirmation_leaves_it_off(): void
    {
        // The dangerous failure would be switching it on with a secret the
        // phone never received.
        $user = $this->admin();
        Sanctum::actingAs($user, ['staff']);

        $this->postJson('/api/auth/two-factor/setup')->assertOk();
        $this->postJson('/api/auth/two-factor/confirm', ['code' => '000000'])->assertStatus(422);

        $this->assertFalse($user->fresh()->hasTwoFactorEnabled());
        $this->signIn()->assertJsonPath('message', 'Login successful');
    }

    public function test_the_secret_is_encrypted_at_rest_and_never_serialized(): void
    {
        [$user, $secret] = $this->enrolled();

        $raw = (string) \DB::table('users')->where('id', $user->id)->value('two_factor_secret');
        $this->assertNotSame($secret, $raw, 'a database dump must not hand over the second factor');
        $this->assertStringNotContainsString($secret, $raw);

        $this->assertArrayNotHasKey('two_factor_secret', $user->toArray());
        $this->assertArrayNotHasKey('two_factor_recovery_codes', $user->toArray());
    }

    public function test_recovery_codes_are_not_stored_in_a_form_that_can_be_read_back(): void
    {
        [$user, , $codes] = $this->enrolled();

        $stored = $user->fresh()->two_factor_recovery_codes;
        foreach ($codes as $code) {
            $this->assertNotContains($code, $stored);
            $this->assertNotContains(str_replace('-', '', $code), $stored);
        }
    }

    // ── Ways back in ──────────────────────────────────────────────────────

    public function test_a_recovery_code_signs_in_and_says_how_many_are_left(): void
    {
        [, , $codes] = $this->enrolled();
        $challenge = $this->signIn()->json('challenge');

        $this->postJson('/api/auth/staff/two-factor-challenge', [
            'challenge' => $challenge,
            'code' => $codes[0],
        ])
            ->assertOk()
            ->assertJsonPath('recovery_code_used', true)
            // Without the count, someone burns all eight without noticing.
            ->assertJsonPath('recovery_codes_remaining', TwoFactorService::RECOVERY_CODE_COUNT - 1);

        $this->assertAuthenticated('web');
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.two_factor_recovery_used']);
    }

    public function test_a_recovery_code_works_only_once(): void
    {
        [, , $codes] = $this->enrolled();

        $first = $this->signIn()->json('challenge');
        $this->postJson('/api/auth/staff/two-factor-challenge', ['challenge' => $first, 'code' => $codes[0]])
            ->assertOk();
        $this->post('/api/auth/logout');

        $second = $this->signIn()->json('challenge');
        $this->postJson('/api/auth/staff/two-factor-challenge', ['challenge' => $second, 'code' => $codes[0]])
            ->assertStatus(422);
    }

    public function test_a_recovery_code_is_accepted_however_it_was_written_down(): void
    {
        // These are copied onto paper and typed back at a stressful moment.
        [, , $codes] = $this->enrolled();
        $challenge = $this->signIn()->json('challenge');

        $mangled = strtolower(str_replace('-', ' ', $codes[0]));

        $this->postJson('/api/auth/staff/two-factor-challenge', [
            'challenge' => $challenge,
            'code' => $mangled,
        ])->assertOk();
    }

    public function test_an_owner_can_clear_two_factor_for_a_lost_phone(): void
    {
        [$user] = $this->enrolled();
        $user->createToken('their-phone', ['staff']);

        $owner = $this->admin(['email' => 'owner2@test.local', 'phone' => '7822222']);
        Sanctum::actingAs($owner, ['staff']);

        $this->deleteJson("/api/admin/staff/{$user->id}/two-factor")
            ->assertOk()
            ->assertJsonPath('staff.two_factor_enabled', false);

        $this->assertFalse($user->fresh()->hasTwoFactorEnabled());
        // The lost phone may be in someone else's hands.
        $this->assertSame(0, $user->fresh()->tokens()->count());

        $entry = AuditLog::query()->where('action', 'auth.two_factor_disabled')->latest('id')->first();
        $this->assertSame($owner->id, $entry->meta['disabled_by']);
        $this->assertFalse($entry->meta['self']);
    }

    public function test_after_an_owner_clears_it_the_password_signs_in_again(): void
    {
        // The reset has to actually restore access, not just clear a column.
        [$user] = $this->enrolled();
        app(TwoFactorService::class)->disable($user->fresh());

        $this->signIn()->assertOk()->assertJsonPath('message', 'Login successful');
        $this->assertAuthenticated('web');
    }

    public function test_the_shell_command_clears_it_without_anyone_signing_in(): void
    {
        // The last resort: one owner, 2FA on, phone gone, recovery codes never
        // printed. Nobody is left who can click the button in the panel.
        [$user] = $this->enrolled();

        $this->artisan('staff:2fa-disable', ['username' => '7811111', '--force' => true])
            ->assertExitCode(0);

        $this->assertFalse($user->fresh()->hasTwoFactorEnabled());
        $this->signIn()->assertJsonPath('message', 'Login successful');
    }

    public function test_the_shell_command_says_so_when_the_account_does_not_exist(): void
    {
        $this->artisan('staff:2fa-disable', ['username' => '7899999', '--force' => true])
            ->assertExitCode(1);
    }

    // ── Turning it off yourself ───────────────────────────────────────────

    public function test_turning_it_off_needs_the_account_password(): void
    {
        // An unattended signed-in admin session is the exact situation the
        // second factor exists to survive.
        [$user] = $this->enrolled();
        Sanctum::actingAs($user, ['staff']);

        $this->deleteJson('/api/auth/two-factor', ['password' => 'not-the-password'])
            ->assertStatus(422);
        $this->assertTrue($user->fresh()->hasTwoFactorEnabled());

        $this->deleteJson('/api/auth/two-factor', ['password' => self::PASSWORD])
            ->assertOk();
        $this->assertFalse($user->fresh()->hasTwoFactorEnabled());
    }

    public function test_regenerating_recovery_codes_retires_the_old_set(): void
    {
        [$user, , $old] = $this->enrolled();
        Sanctum::actingAs($user, ['staff']);

        $new = $this->postJson('/api/auth/two-factor/recovery-codes', ['password' => self::PASSWORD])
            ->assertOk()
            ->json('recovery_codes');

        $this->assertCount(TwoFactorService::RECOVERY_CODE_COUNT, $new);
        $this->assertEmpty(array_intersect($old, $new));

        // The retired ones must actually stop working.
        $challenge = $this->signIn()->json('challenge');
        $this->postJson('/api/auth/staff/two-factor-challenge', ['challenge' => $challenge, 'code' => $old[0]])
            ->assertStatus(422);
    }

    public function test_status_reports_what_the_account_has(): void
    {
        [$user] = $this->enrolled();
        Sanctum::actingAs($user, ['staff']);

        $this->getJson('/api/auth/two-factor')
            ->assertOk()
            ->assertJsonPath('enabled', true)
            ->assertJsonPath('recovery_codes_remaining', TwoFactorService::RECOVERY_CODE_COUNT);
    }

    // ── The policy switch ─────────────────────────────────────────────────

    public function test_the_requirement_is_off_by_default(): void
    {
        // Switching this on before everyone has enrolled locks them out of the
        // panel they would enrol from.
        $this->assertFalse((bool) config('twofactor.required_for_admin'));
    }

    public function test_when_required_an_admin_without_two_factor_is_told_what_to_do(): void
    {
        config(['twofactor.required_for_admin' => true]);
        $this->admin();

        $response = $this->signIn()->assertStatus(422);

        $this->assertStringContainsString(
            'two-factor',
            strtolower((string) $response->json('errors.phone.0')),
            'the person has a correct password and needs to be told why it stopped working',
        );
        $this->assertGuest('web');
    }
}
