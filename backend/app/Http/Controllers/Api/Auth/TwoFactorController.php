<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\TwoFactorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * Managing your own second factor, from My Account in the admin panel.
 *
 * Turning it on is free; turning it off costs a password, because otherwise a
 * borrowed unlocked laptop removes the protection in two clicks and the whole
 * thing is theatre.
 */
class TwoFactorController extends Controller
{
    public function __construct(private readonly TwoFactorService $twoFactor) {}

    /** GET /api/auth/two-factor — what the account currently has. */
    public function status(Request $request): JsonResponse
    {
        $user = $this->staff($request);

        return response()->json([
            'enabled' => $user->hasTwoFactorEnabled(),
            // A started-but-abandoned enrolment, so the UI can offer to resume
            // rather than silently show "off" over a stored secret.
            'pending' => $user->two_factor_secret !== null && $user->two_factor_confirmed_at === null,
            'confirmed_at' => $user->two_factor_confirmed_at?->toIso8601String(),
            'recovery_codes_remaining' => $this->twoFactor->remainingRecoveryCodes($user),
            'required_for_admin' => (bool) config('twofactor.required_for_admin'),
        ]);
    }

    /**
     * POST /api/auth/two-factor/setup — a fresh secret and its QR payload.
     *
     * Nothing is enforced yet; the account still signs in with one factor
     * until confirm() proves a code has actually reached the phone.
     */
    public function setup(Request $request): JsonResponse
    {
        $user = $this->staff($request);

        if ($user->hasTwoFactorEnabled()) {
            // Re-issuing a secret over a working one would invalidate the app
            // entry the person is currently relying on.
            throw ValidationException::withMessages([
                'code' => ['Two-factor is already on for this account. Turn it off first if you want to set up a new phone.'],
            ]);
        }

        $enrolment = $this->twoFactor->beginEnrolment($user);

        return response()->json([
            'uri' => $enrolment['uri'],
            // For anyone whose camera will not scan the QR code.
            'secret' => $enrolment['secret_display'],
        ]);
    }

    /**
     * POST /api/auth/two-factor/confirm — prove a code, switch it on, and hand
     * back the recovery codes.
     *
     * The codes are returned exactly once. They are stored hashed, so there is
     * no second chance to read them — only a regenerate.
     */
    public function confirm(Request $request): JsonResponse
    {
        $user = $this->staff($request);

        $request->validate(['code' => 'required|string|max:32']);

        if ($user->hasTwoFactorEnabled()) {
            throw ValidationException::withMessages([
                'code' => ['Two-factor is already on for this account.'],
            ]);
        }

        if ($user->two_factor_secret === null) {
            throw ValidationException::withMessages([
                'code' => ['Start the setup again — no pending authenticator was found.'],
            ]);
        }

        $this->throttleCodeAttempts($user, 'confirm');

        $codes = $this->twoFactor->confirmEnrolment($user, $request->string('code')->toString(), $request);

        if ($codes === null) {
            throw ValidationException::withMessages([
                'code' => ['That code is not right. Check the time on your phone, then try the next code.'],
            ]);
        }

        RateLimiter::clear($this->codeAttemptKey($user, 'confirm'));

        return response()->json([
            'message' => 'Two-factor authentication is on.',
            'recovery_codes' => $codes,
        ]);
    }

    /**
     * DELETE /api/auth/two-factor — turn it off for yourself.
     *
     * Guarded by the account password. An unattended, already-signed-in admin
     * session is exactly the situation the second factor exists to survive.
     */
    public function disable(Request $request): JsonResponse
    {
        $user = $this->staff($request);

        $request->validate(['password' => 'required|string']);

        $this->throttleCodeAttempts($user, 'disable');
        $this->assertPasswordMatches($user, $request->string('password')->toString());

        if ((bool) config('twofactor.required_for_admin')) {
            // Letting them switch it off under this policy would just lock the
            // account out on the next sign-in.
            throw ValidationException::withMessages([
                'password' => ['Two-factor is required for admin accounts here and cannot be turned off.'],
            ]);
        }

        RateLimiter::clear($this->codeAttemptKey($user, 'disable'));
        $this->twoFactor->disable($user, $user, $request);

        return response()->json(['message' => 'Two-factor authentication is off.']);
    }

    /**
     * POST /api/auth/two-factor/recovery-codes — issue a new set.
     *
     * Also password-guarded: the old set stops working the moment this runs,
     * and that is not something a passer-by should be able to do.
     */
    public function regenerateRecoveryCodes(Request $request): JsonResponse
    {
        $user = $this->staff($request);

        $request->validate(['password' => 'required|string']);

        if (!$user->hasTwoFactorEnabled()) {
            throw ValidationException::withMessages([
                'password' => ['Two-factor is not on for this account.'],
            ]);
        }

        $this->throttleCodeAttempts($user, 'recovery');
        $this->assertPasswordMatches($user, $request->string('password')->toString());
        RateLimiter::clear($this->codeAttemptKey($user, 'recovery'));

        return response()->json([
            'message' => 'New recovery codes. The old ones no longer work.',
            'recovery_codes' => $this->twoFactor->regenerateRecoveryCodes($user, $request),
        ]);
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private function staff(Request $request): User
    {
        $user = $request->user();

        if (!$user instanceof User) {
            abort(403, 'Forbidden - staff access only');
        }

        return $user;
    }

    private function assertPasswordMatches(User $user, string $plain): void
    {
        $hash = $user->getAuthPassword();

        if (!is_string($hash) || $hash === '' || !Hash::check($plain, $hash)) {
            throw ValidationException::withMessages([
                'password' => ['That password is not right.'],
            ]);
        }
    }

    /**
     * These endpoints sit behind a session, so the limiter is not the front
     * line — it is here so a stolen session cannot be used to grind at the
     * password on the disable route.
     */
    private function throttleCodeAttempts(User $user, string $scope): void
    {
        $key = $this->codeAttemptKey($user, $scope);

        if (RateLimiter::tooManyAttempts($key, 6)) {
            throw ValidationException::withMessages([
                'code' => ['Too many attempts. Try again in ' . ceil(RateLimiter::availableIn($key) / 60) . ' minutes.'],
            ]);
        }

        RateLimiter::hit($key, 600);
    }

    private function codeAttemptKey(User $user, string $scope): string
    {
        return "2fa:{$scope}:{$user->id}";
    }
}
