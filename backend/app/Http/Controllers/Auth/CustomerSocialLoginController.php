<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Domains\Auth\Services\SocialLoginService;
use App\Domains\Auth\SocialLogin\SocialLoginException;
use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

/**
 * The browser side of customer sign-in with Google, Facebook and Apple (iruali
 * import plan, feature 1). The order app sends the customer to /auth/social/
 * {provider}; the provider sends them back to the callback, which signs them in
 * with the customer session and returns to the order app, or, when the phone is
 * still needed, returns with ?social=phone so the app asks for it.
 */
class CustomerSocialLoginController extends Controller
{
    public function __construct(private readonly SocialLoginService $social) {}

    public function redirect(Request $request, string $provider): RedirectResponse
    {
        $p = $this->social->provider($provider);
        if ($p === null || !$p->configured()) {
            return $this->back('/order/account', 'error', 'That sign-in is not available.');
        }

        return redirect()->away($this->social->start($p, $request->session(), $this->returnPath($request->query('return'))));
    }

    public function callback(Request $request, string $provider): RedirectResponse
    {
        $p = $this->social->provider($provider);
        if ($p === null || !$p->configured()) {
            return $this->back('/order/account', 'error', 'That sign-in is not available.');
        }
        $fields = $request->query();
        if ($provider === 'apple' && $request->query('handoff') !== null) {
            $fields = $this->social->takeHandoff($request->query('handoff')) ?? [];
        }

        try {
            [$profile, $return] = $this->social->finish($p, $fields, $request->session());
            $customer = $this->social->resolve($profile);
            if ($customer === null) {
                $this->social->keepPending($profile, $request->session());

                return $this->back($return, 'phone');
            }
        } catch (SocialLoginException $e) {
            return $this->back('/order/account', 'error', $e->getMessage());
        }

        Auth::guard('customer')->login($customer);
        $request->session()->regenerate();
        $customer->forceFill(['last_login_at' => now()])->save();
        Log::info('customer signed in with a social account', ['customer_id' => $customer->id, 'provider' => $provider]);

        return $this->back($return, 'ok');
    }

    /** Apple's form post: keep what it sent and continue in the callback, with the session. */
    public function applePost(Request $request): RedirectResponse
    {
        $key = $this->social->handoff($request->only(['code', 'state', 'user', 'error']));

        return redirect()->route('customer.social.callback', ['provider' => 'apple', 'handoff' => $key]);
    }

    /** Only paths in the order app; anything else goes to its account page. */
    private function returnPath(mixed $return): string
    {
        return is_string($return) && preg_match('#^/order(/[A-Za-z0-9/_\-]*)?$#', $return) ? $return : '/order/account';
    }

    private function back(string $path, string $result, ?string $message = null): RedirectResponse
    {
        $query = ['social' => $result] + ($message !== null ? ['social_message' => $message] : []);

        return redirect($path . (str_contains($path, '?') ? '&' : '?') . http_build_query($query));
    }
}
