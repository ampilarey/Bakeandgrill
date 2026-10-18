<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Auth\Services\CustomerOtpService;
use App\Domains\Customers\Support\GuestNumbers;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\OtpVerification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * "Verify your number to collect your rewards" (owner, 2026-10-18): a guest checks the
 * number they typed, from their own session, with a code texted to it. Only a text
 * proves a phone, so the code never goes by email. The account's history stays theirs
 * and the points held back are added (GuestNumbers::claim).
 */
class CustomerPhoneController extends Controller
{
    public function __construct(private readonly CustomerOtpService $otp) {}

    /** GET /api/customer/phone */
    public function show(Request $request): JsonResponse
    {
        $customer = $this->customer($request);

        return response()->json([
            'phone' => $customer->phone,
            'unverified' => (bool) $customer->phone_unverified,
            'held_orders' => GuestNumbers::heldOrders($customer)->count(),
            'held_points' => GuestNumbers::heldPoints($customer),
        ]);
    }

    /** POST /api/customer/phone/send-code */
    public function sendCode(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        if (!$customer->phone_unverified) {
            return response()->json(['unverified' => false, 'message' => 'Your number is already verified.']);
        }
        $recent = OtpVerification::query()
            ->where('phone', $customer->phone)
            ->where('purpose', GuestNumbers::VERIFY_PURPOSE)
            ->where('created_at', '>', now()->subMinute())
            ->exists();
        if ($recent) {
            throw ValidationException::withMessages(['phone' => ['We just sent a code. Please wait a minute before asking for another.']]);
        }

        $this->otp->issue((string) $customer->phone, GuestNumbers::VERIFY_PURPOSE, 'sms');

        return response()->json([
            'unverified' => true,
            'sent_to' => $customer->phone,
            'expires_minutes' => CustomerOtpService::TTL_MINUTES,
            'message' => 'We texted a 6-digit code to ' . $customer->phone . '.',
        ]);
    }

    /** POST /api/customer/phone/verify */
    public function verify(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        $data = $request->validate(['code' => 'required|string|size:6']);
        if (!$customer->phone_unverified) {
            return response()->json(['unverified' => false, 'points_added' => 0, 'message' => 'Your number is already verified.']);
        }

        $this->otp->verifyAndConsume((string) $customer->phone, $data['code'], [GuestNumbers::VERIFY_PURPOSE]);
        $added = GuestNumbers::claim($customer);

        return response()->json([
            'unverified' => false,
            'points_added' => $added,
            'message' => $added > 0 ? "Thanks. Your number is verified and {$added} points were added." : 'Thanks. Your number is verified.',
        ]);
    }

    /** GET /api/auth/customer/guest-rules: whether the checkout offers guest checkout. */
    public function guestRules(): JsonResponse
    {
        return response()->json(['guest_checkout' => GuestNumbers::guestCheckoutOn()]);
    }

    private function customer(Request $request): Customer
    {
        $customer = $request->user();
        abort_unless($customer instanceof Customer, 403, 'Forbidden — customer access only.');

        return $customer;
    }
}
