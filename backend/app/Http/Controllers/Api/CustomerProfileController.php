<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Protected customer profile endpoints.
 * All routes here require auth:sanctum + customer.token (or session auth via customer guard).
 */
class CustomerProfileController extends Controller
{
    /**
     * First-time profile setup — collects name, email, and sets a password.
     * Called after OTP verification when is_profile_complete === false.
     */
    public function completeProfile(Request $request)
    {
        $input = $request->validate([
            'name'                  => 'required|string|max:100',
            'email'                 => 'nullable|email|max:100',
            'password'              => 'required|string|min:8|confirmed',
            'password_confirmation' => 'required|string',
        ]);

        /** @var Customer $customer */
        $customer = $request->user();

        $customer->update([
            'name'                => $input['name'],
            'email'               => $input['email'] ?? $customer->email,
            'password'            => $input['password'],
            'is_profile_complete' => true,
        ]);

        return response()->json([
            'message'  => 'Profile completed successfully',
            'customer' => [
                'id'                  => $customer->id,
                'phone'               => $customer->phone,
                'name'                => $customer->name,
                'email'               => $customer->email,
                'loyalty_points'      => $customer->loyalty_points,
                'tier'                => $customer->tier,
                'is_profile_complete' => true,
            ],
        ]);
    }

    /**
     * Change password for a logged-in customer who already has a password.
     */
    public function changePassword(Request $request)
    {
        $input = $request->validate([
            'current_password'      => 'required|string',
            'password'              => 'required|string|min:8|confirmed',
            'password_confirmation' => 'required|string',
        ]);

        /** @var Customer $customer */
        $customer = $request->user();

        if (empty($customer->password) || ! Hash::check($input['current_password'], $customer->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['Current password is incorrect.'],
            ]);
        }

        $customer->update(['password' => $input['password']]);

        return response()->json(['message' => 'Password changed successfully']);
    }
}
