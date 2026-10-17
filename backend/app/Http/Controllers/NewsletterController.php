<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Newsletter\Newsletter;
use App\Models\Customer;
use App\Models\NewsletterSubscriber;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\View\View;

/** Newsletter sign-up, confirm and unsubscribe (iruali import plan, feature 4). */
class NewsletterController extends Controller
{
    public function __construct(private readonly Newsletter $newsletter) {}

    /** POST /newsletter/subscribe (website footer) and POST /api/newsletter/subscribe. */
    public function subscribe(Request $request): JsonResponse|RedirectResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email:rfc', 'max:190'],
            'locale' => ['nullable', 'in:en,dv'],
            'source' => ['nullable', 'in:website,order_app'],
            'website' => ['nullable', 'max:0'], // honeypot
        ]);
        $customer = $request->user('customer') ?? ($request->user() instanceof Customer ? $request->user() : null);
        $this->newsletter->subscribe($validated['email'], $validated['locale'] ?? app()->getLocale(), $validated['source'] ?? 'website', $customer);
        $message = 'Check your email: we sent a link to confirm. Nothing comes until you click it.';

        return $request->expectsJson()
            ? response()->json(['message' => $message])
            : back()->with('newsletter_status', $message);
    }

    /** GET /newsletter/confirm/{token} */
    public function confirm(string $token): View
    {
        $sub = $this->newsletter->confirm($token);

        return view('newsletter-status', ['state' => $sub ? 'confirmed' : 'expired', 'email' => $sub?->email]);
    }

    /** GET /newsletter/unsubscribe/{token}: a button, since link checkers open links. */
    public function unsubscribeForm(Request $request, string $token): View
    {
        $sub = NewsletterSubscriber::query()->where('token', $token)->first();
        if ($sub === null) {
            return view('newsletter-status', ['state' => 'expired', 'email' => null]);
        }

        return view('newsletter-status', ['state' => $sub->unsubscribed_at ? 'stopped' : 'ask', 'email' => $sub->email, 'action' => $request->fullUrl()]);
    }

    /** POST /newsletter/unsubscribe/{token}, also the mail apps' one-click. */
    public function unsubscribe(Request $request, string $token): View|Response
    {
        $sub = NewsletterSubscriber::query()->where('token', $token)->first();
        if ($sub !== null && $sub->unsubscribed_at === null) {
            $this->newsletter->unsubscribe($sub);
        }
        if ($request->input('List-Unsubscribe') === 'One-Click') {
            return response()->noContent();
        }

        return view('newsletter-status', ['state' => $sub ? 'stopped' : 'expired', 'email' => $sub?->email]);
    }
}
