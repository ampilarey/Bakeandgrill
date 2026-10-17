<?php

declare(strict_types=1);

namespace App\Domains\Auth\Services;

use App\Domains\Auth\SocialLogin\AppleProvider;
use App\Domains\Auth\SocialLogin\FacebookProvider;
use App\Domains\Auth\SocialLogin\GoogleProvider;
use App\Domains\Auth\SocialLogin\Provider;
use App\Domains\Auth\SocialLogin\SocialLoginException;
use App\Domains\Auth\SocialLogin\SocialProfile;
use App\Models\Customer;
use App\Models\CustomerSocialAccount;
use App\Models\User;
use Illuminate\Contracts\Session\Session;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Customer sign-in with Google, Facebook and Apple (iruali import plan, feature 1).
 *
 * The OAuth / OpenID Connect work is iruali's providers (state, nonce and PKCE
 * where the provider supports it). Who the person is:
 *   1. a sign-in linked before → that customer;
 *   2. else a customer whose checked email matches, when the provider vouches
 *      the email is verified → link it;
 *   3. else "pending": the order app asks for the phone and the usual SMS code,
 *      and the sign-in is linked to that phone's customer on success
 *      (completePending). A phone is needed for every order, so a social
 *      sign-in never makes a customer without one.
 * Staff are users, not customers, so this cannot sign staff in; it also refuses
 * to link a sign-in whose email or phone belongs to an active staff member.
 */
class SocialLoginService
{
    public const PROVIDERS = [
        'google' => GoogleProvider::class,
        'facebook' => FacebookProvider::class,
        'apple' => AppleProvider::class,
    ];

    private const ATTEMPT_KEY = 'customer_social.attempt';

    public const PENDING_KEY = 'customer_social.pending';

    private const ATTEMPT_MINUTES = 10;

    private const PENDING_MINUTES = 15;

    public function provider(string $name): ?Provider
    {
        $class = self::PROVIDERS[$name] ?? null;

        return $class ? app($class) : null;
    }

    /** @return list<Provider> the providers whose keys are set: the buttons. */
    public function enabled(): array
    {
        return array_values(array_filter(
            array_map(fn (string $name) => $this->provider($name), array_keys(self::PROVIDERS)),
            fn (?Provider $p) => $p?->configured() === true,
        ));
    }

    /** Remember this attempt in the session and return the provider's page. */
    public function start(Provider $provider, Session $session, string $return): string
    {
        $state = Str::random(40);
        $nonce = Str::random(40);
        $verifier = $provider->usesPkce() ? Str::random(64) : null;
        $session->put(self::ATTEMPT_KEY, [
            'provider' => $provider->name(), 'state' => $state, 'nonce' => $nonce,
            'verifier' => $verifier, 'return' => $return, 'at' => now()->getTimestamp(),
        ]);
        $challenge = $verifier === null ? null : rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

        return $provider->authorizeUrl($state, $nonce, $challenge);
    }

    /**
     * Read who signed in from what the provider sent back. The attempt is used up either way.
     *
     * @param array<string, mixed> $callback
     * @return array{0: SocialProfile, 1: string} the profile and where to go back to
     */
    public function finish(Provider $provider, array $callback, Session $session): array
    {
        $attempt = $session->pull(self::ATTEMPT_KEY);
        $state = $callback['state'] ?? null;
        if (!is_array($attempt) || ($attempt['provider'] ?? null) !== $provider->name() || !is_string($state)
            || !hash_equals((string) ($attempt['state'] ?? ''), $state)
            || (int) ($attempt['at'] ?? 0) < now()->subMinutes(self::ATTEMPT_MINUTES)->getTimestamp()) {
            throw SocialLoginException::expired();
        }
        if (isset($callback['error'])) {
            throw SocialLoginException::cancelled($provider->label());
        }
        $code = $callback['code'] ?? null;
        if (!is_string($code) || $code === '' || strlen($code) > 2048) {
            throw SocialLoginException::failed($provider->label());
        }
        try {
            $profile = $provider->profile($code, $attempt['verifier'] ?? null, (string) $attempt['nonce'], $callback);
        } catch (ConnectionException $e) {
            report($e);

            throw SocialLoginException::failed($provider->label());
        }

        return [$profile, (string) ($attempt['return'] ?? '/order/account')];
    }

    /**
     * The customer for this sign-in, linked if it was found by email, or null when
     * the phone is still needed.
     */
    public function resolve(SocialProfile $profile): ?Customer
    {
        $linked = CustomerSocialAccount::query()->where('provider', $profile->provider)->where('subject', $profile->subject)->first();
        if ($linked !== null) {
            $customer = Customer::query()->find($linked->customer_id);
            if ($customer !== null) {
                $this->allowed($customer, $profile);
                $linked->forceFill(['email' => $profile->email ?? $linked->email, 'last_used_at' => now()])->save();

                return $customer;
            }
            $linked->delete();
        }

        $email = mb_strtolower(trim((string) $profile->email));
        if ($email !== '' && $profile->emailVerified) {
            $this->refuseStaffEmail($email);
            $match = Customer::query()->whereRaw('LOWER(email) = ?', [$email])->whereNotNull('email_verified_at')->get()
                ->filter(fn (Customer $c) => $c->hasVerifiedEmail());
            if ($match->count() === 1) {
                $customer = $match->first();
                $this->allowed($customer, $profile);
                $this->link($customer, $profile);

                return $customer;
            }
        }

        return null;
    }

    /** Keep a sign-in that still needs the phone, for the order app to finish. */
    public function keepPending(SocialProfile $profile, Session $session): void
    {
        if ($profile->email !== null) {
            $this->refuseStaffEmail(mb_strtolower(trim($profile->email)));
        }
        $session->put(self::PENDING_KEY, $profile->toArray() + ['at' => now()->getTimestamp()]);
    }

    /** What the order app shows while a sign-in waits for the phone, or null. */
    public function pending(Session $session): ?array
    {
        $data = $session->get(self::PENDING_KEY);
        if (!is_array($data) || (int) ($data['at'] ?? 0) < now()->subMinutes(self::PENDING_MINUTES)->getTimestamp()) {
            return null;
        }
        $provider = $this->provider((string) ($data['provider'] ?? ''));

        return $provider ? ['provider' => $provider->name(), 'label' => $provider->label(), 'name' => $data['name'] ?? null, 'email' => $data['email'] ?? null] : null;
    }

    /**
     * After the phone code signs the customer in, link the waiting sign-in to them.
     * Returns the provider's label when one was linked.
     */
    public function completePending(Customer $customer, Session $session): ?string
    {
        $data = $session->pull(self::PENDING_KEY);
        if (!is_array($data) || (int) ($data['at'] ?? 0) < now()->subMinutes(self::PENDING_MINUTES)->getTimestamp()) {
            return null;
        }
        $profile = SocialProfile::fromArray($data);
        if ($profile === null) {
            return null;
        }
        try {
            $this->allowed($customer, $profile);
        } catch (SocialLoginException) {
            return null;
        }
        $taken = CustomerSocialAccount::query()->where('provider', $profile->provider)->where('subject', $profile->subject)->first();
        if ($taken !== null && (int) $taken->customer_id !== (int) $customer->id) {
            return null;
        }
        $this->link($customer, $profile);
        if (blank($customer->name) && filled($profile->name)) {
            $customer->forceFill(['name' => mb_substr((string) $profile->name, 0, 100)])->save();
        }
        // The provider vouched for this email: it counts as checked, when the account has none yet.
        if (blank($customer->email) && $profile->emailVerified && filled($profile->email)) {
            $customer->forceFill(['email' => mb_strtolower((string) $profile->email), 'email_verified_at' => now()])->save();
        }

        return $this->provider($profile->provider)?->label();
    }

    public function unlink(Customer $customer, string $provider): bool
    {
        return CustomerSocialAccount::query()->where('customer_id', $customer->id)->where('provider', $provider)->delete() > 0;
    }

    /** @return list<array{provider: string, label: string, email: ?string}> */
    public function linked(Customer $customer): array
    {
        return $customer->socialAccounts()->orderBy('provider')->get()->map(fn (CustomerSocialAccount $a) => [
            'provider' => $a->provider,
            'label' => $this->provider($a->provider)?->label() ?? ucfirst($a->provider),
            'email' => $a->email,
        ])->values()->all();
    }

    /**
     * Apple answers with a form post that arrives without the session: keep its
     * fields a few minutes under a one-time key the session-ful callback reads.
     *
     * @param array<string, mixed> $fields
     */
    public function handoff(array $fields): string
    {
        $kept = [];
        foreach (['code', 'state', 'user', 'error'] as $name) {
            if (is_string($fields[$name] ?? null)) {
                $kept[$name] = mb_substr($fields[$name], 0, 4096);
            }
        }
        $key = Str::random(40);
        Cache::put('customer-social:apple:' . $key, $kept, now()->addMinutes(5));

        return $key;
    }

    /** @return array<string, string>|null */
    public function takeHandoff(mixed $key): ?array
    {
        if (!is_string($key) || !preg_match('/^[A-Za-z0-9]{40}$/', $key)) {
            return null;
        }
        $fields = Cache::pull('customer-social:apple:' . $key);

        return is_array($fields) ? $fields : null;
    }

    private function link(Customer $customer, SocialProfile $profile): void
    {
        CustomerSocialAccount::query()->updateOrCreate(
            ['customer_id' => $customer->id, 'provider' => $profile->provider],
            ['subject' => $profile->subject, 'email' => $profile->email, 'last_used_at' => now()],
        );
    }

    private function allowed(Customer $customer, SocialProfile $profile): void
    {
        // A customer just made has no is_active yet (the column defaults to true).
        if ($customer->is_active === false || $customer->trashed()) {
            throw SocialLoginException::inactive();
        }
        $local = substr(preg_replace('/\D/', '', (string) $customer->phone) ?? '', -7);
        if (strlen($local) === 7 && User::query()->where('is_active', true)->whereIn('phone', ['+960' . $local, '960' . $local, $local])->exists()) {
            throw SocialLoginException::staff();
        }
        if ($profile->email !== null) {
            $this->refuseStaffEmail(mb_strtolower(trim($profile->email)));
        }
    }

    private function refuseStaffEmail(string $email): void
    {
        if ($email !== '' && User::query()->where('is_active', true)->whereRaw('LOWER(email) = ?', [$email])->exists()) {
            throw SocialLoginException::staff();
        }
    }
}
