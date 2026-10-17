<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Auth\Services\SocialLoginService;
use App\Domains\Auth\SocialLogin\Provider;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The order app's side of social sign-in (iruali import plan, feature 1): which
 * buttons to show, the sign-in waiting for a phone, and unlinking.
 */
class CustomerSocialController extends Controller
{
    public function __construct(private readonly SocialLoginService $social) {}

    /** GET /api/auth/customer/social */
    public function show(Request $request): JsonResponse
    {
        return response()->json([
            'providers' => array_map(fn (Provider $p) => ['provider' => $p->name(), 'label' => $p->label()], $this->social->enabled()),
            'pending' => $request->hasSession() ? $this->social->pending($request->session()) : null,
        ]);
    }

    /** DELETE /api/customer/social/{provider} */
    public function unlink(Request $request, string $provider): JsonResponse
    {
        $customer = $request->user();
        abort_unless($customer instanceof Customer, 403);
        $this->social->unlink($customer, $provider);

        return response()->json(['social_accounts' => $this->social->linked($customer)]);
    }
}
