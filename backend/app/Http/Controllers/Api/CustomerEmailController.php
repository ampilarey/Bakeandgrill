<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Auth\Services\CustomerOtpService;
use App\Http\Controllers\Controller;
use App\Mail\CustomerOtpMail;
use App\Models\Customer;
use App\Models\OtpVerification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Prove the email on a customer's account with a 6-digit code (iruali import
 * plan, feature 2). Only a proven email gets offers and newsletters by email
 * and can be matched by social sign-in; receipts still go to any email given.
 */
class CustomerEmailController extends Controller
{
    public function __construct(private readonly CustomerOtpService $otp) {}

    /** POST /api/customer/email/send-code */
    public function sendCode(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        if (blank($customer->email)) {
            throw ValidationException::withMessages(['email' => ['Add an email to your account first.']]);
        }
        if ($customer->hasVerifiedEmail()) {
            return response()->json(['email_verified' => true, 'message' => 'This email is already checked.']);
        }
        $recent = OtpVerification::query()
            ->where('phone', $customer->phone)
            ->where('purpose', CustomerOtpMail::VERIFY_PURPOSE)
            ->where('created_at', '>', now()->subMinute())
            ->exists();
        if ($recent) {
            throw ValidationException::withMessages(['email' => ['We just sent a code. Please wait a minute before asking for another.']]);
        }

        $this->otp->issue((string) $customer->phone, CustomerOtpMail::VERIFY_PURPOSE, 'email', (string) $customer->email);

        return response()->json([
            'email_verified' => false,
            'sent_to' => $customer->email,
            'expires_minutes' => CustomerOtpService::TTL_MINUTES,
            'message' => 'We sent a 6-digit code to ' . $customer->email . '.',
        ]);
    }

    /** POST /api/customer/email/verify */
    public function verify(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        $data = $request->validate(['code' => 'required|string|size:6']);

        // The code must have been sent to the email the account has now, not
        // to an address it has since been changed from.
        $latest = OtpVerification::query()
            ->where('phone', $customer->phone)
            ->where('purpose', CustomerOtpMail::VERIFY_PURPOSE)
            ->whereNull('used_at')
            ->orderByDesc('id')
            ->first();
        if ($latest === null || mb_strtolower((string) $latest->email) !== mb_strtolower((string) $customer->email)) {
            throw ValidationException::withMessages(['otp' => ['That code was for another email. Please ask for a new one.']]);
        }

        $this->otp->verifyAndConsume((string) $customer->phone, $data['code'], [CustomerOtpMail::VERIFY_PURPOSE]);
        $customer->forceFill(['email_verified_at' => now()])->save();

        return response()->json(['email_verified' => true, 'message' => 'Thanks. Your email is checked.']);
    }

    private function customer(Request $request): Customer
    {
        $customer = $request->user();
        abort_unless($customer instanceof Customer, 403, 'Forbidden — customer access only.');

        return $customer;
    }
}
