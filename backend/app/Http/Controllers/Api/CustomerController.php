<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CustomerSmsOptOutRequest;
use App\Models\Customer;
use App\Services\AuditLogService;
use App\Support\PhoneNormalizer;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    /**
     * Lightweight customer search for the POS — staff-only.
     *
     * The existing AdminCustomerController requires the `customers.manage`
     * permission, which a cashier rarely has. This one is purposely thin:
     * any authenticated staff (auth:sanctum + staff.token) can match by
     * name OR phone OR email, capped at 10 results, returning only what
     * the POS Customer Picker needs to render. No pagination — the UI
     * just keeps typing if 10 isn't enough.
     */
    public function search(Request $request)
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $q = trim((string) $request->query('q', ''));
        if (mb_strlen($q) < 2) {
            return response()->json(['data' => []]);
        }

        // If it looks like a phone number, normalise so "+960 712-3456",
        // "+9607123456" and "07123456" all hit the same row.
        $normalised = null;
        if (preg_match('/^\+?[\d\s\-]+$/', $q)) {
            try { $normalised = PhoneNormalizer::normalize($q); } catch (\Throwable) { /* fall back to LIKE */ }
        }

        $like = '%' . $q . '%';
        $matches = Customer::query()
            ->select(['id', 'name', 'phone', 'email', 'loyalty_points', 'tier', 'sms_opt_out', 'last_order_at'])
            ->withCount('orders')
            ->where(function ($w) use ($like, $normalised) {
                $w->where('name', 'like', $like)
                  ->orWhere('email', 'like', $like)
                  ->orWhere('phone', 'like', $like);
                if ($normalised) {
                    $w->orWhere('phone', $normalised);
                }
            })
            ->orderByDesc('last_order_at')
            ->limit(10)
            ->get();

        return response()->json(['data' => $matches]);
    }

    /**
     * Quick-create or fetch a customer by phone — staff-only.
     *
     * Idempotent on phone: same phone never creates a duplicate row, the
     * existing customer is returned (so the POS can use this either as
     * "find me by phone" or "create on first use" without branching).
     * Name is optional (only set when not already present, so a cashier
     * can't accidentally clobber an existing customer's profile).
     */
    public function quickCreate(Request $request)
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $data = $request->validate([
            // Accept anything roughly phone-shaped: at least 5 digits with
            // optional +, spaces, dashes. PhoneNormalizer happily eats
            // garbage (returns "+960"), so we gate on the raw string
            // BEFORE handing it to the normalizer.
            'phone' => ['required', 'string', 'max:30', 'regex:/^\+?[\d\s\-]{5,}$/'],
            'name'  => 'nullable|string|max:120',
        ]);

        try {
            $phone = PhoneNormalizer::normalize($data['phone']);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Invalid phone number.'], 422);
        }
        // Defensive second check: normalizer must produce more than just
        // the country code. If it does, the input was effectively empty.
        if (strlen(preg_replace('/[^0-9]/', '', $phone)) < 8) {
            return response()->json(['message' => 'Invalid phone number.'], 422);
        }

        $customer = Customer::firstOrCreate(
            ['phone' => $phone],
            [
                'name' => $data['name'] ?? null,
                'loyalty_points' => 0,
                'tier' => 'bronze',
                'is_active' => true,
            ],
        );

        // Only fill in the name if the customer doesn't already have one —
        // never overwrite an existing profile from a quick-attach.
        if (!empty($data['name']) && empty($customer->name)) {
            $customer->update(['name' => $data['name']]);
        }

        $wasCreated = $customer->wasRecentlyCreated;
        if ($wasCreated) {
            app(AuditLogService::class)->log('customer.quick_created', 'Customer', $customer->id, [], $customer->toArray(), [], $request);
        }

        return response()->json([
            'customer' => $customer->fresh()->loadCount('orders'),
            'created' => $wasCreated,
        ], $wasCreated ? 201 : 200);
    }

    /**
     * Get current customer info
     */
    public function me(Request $request)
    {
        // SECURITY: Ensure this is a customer token, not staff
        if (!$request->user()->tokenCan('customer')) {
            return response()->json(['message' => 'Forbidden - customer access only'], 403);
        }

        $customer = $request->user();

        return response()->json([
            'customer' => [
                'id' => $customer->id,
                'phone' => $customer->phone,
                'name' => $customer->name,
                'email' => $customer->email,
                'loyalty_points' => $customer->loyalty_points,
                'tier' => $customer->tier,
                'preferred_language' => $customer->preferred_language,
                'last_order_at' => $customer->last_order_at,
            ],
        ]);
    }

    /**
     * Get customer's order history
     */
    public function orders(Request $request)
    {
        $customer = $request->user();

        // Defensive: EnsureCustomerToken middleware already enforces this.
        if (!$customer instanceof Customer) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        $orders = $customer->orders()
            ->with(['items', 'payments'])
            ->orderBy('created_at', 'desc')
            ->paginate(15);

        return response()->json($orders);
    }

    /**
     * GET /api/customer/orders/{id}
     * Single order detail — used by online order status page.
     */
    public function show(Request $request, int $id)
    {
        $customer = $request->user();

        // Defensive: EnsureCustomerToken middleware already enforces this.
        if (!$customer instanceof Customer) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        $order = $customer->orders()
            ->with(['items.item', 'payments'])
            ->findOrFail($id);

        return response()->json([
            'order' => [
                'id' => $order->id,
                'order_number' => $order->order_number,
                'status' => $order->status,
                'type' => $order->type,
                'total' => (float) $order->total,
                'total_laar' => (int) ($order->total_laar ?? round((float) $order->total * 100)),
                'subtotal' => (float) ($order->subtotal ?? $order->total),
                'delivery_fee' => (float) ($order->delivery_fee ?? 0),
                'promo_discount_laar' => (int) ($order->promo_discount_laar ?? 0),
                'loyalty_discount_laar' => (int) ($order->loyalty_discount_laar ?? 0),
                'gift_card_discount_laar' => (int) ($order->gift_card_discount_laar ?? 0),
                'referral_discount_laar' => (int) ($order->referral_discount_laar ?? 0),
                'paid_at' => $order->paid_at?->toIso8601String(),
                'created_at' => $order->created_at->toIso8601String(),
                // Delivery fields
                'delivery_address_line1' => $order->delivery_address_line1,
                'delivery_address_line2' => $order->delivery_address_line2,
                'delivery_island' => $order->delivery_island,
                'delivery_contact_name' => $order->delivery_contact_name,
                'delivery_contact_phone' => $order->delivery_contact_phone,
                'delivery_notes' => $order->delivery_notes,
            ],
        ]);
    }

    /**
     * Update customer profile
     */
    public function update(Request $request)
    {
        $customer = $request->user();

        // Defensive: EnsureCustomerToken middleware already enforces this.
        if (!$customer instanceof Customer) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'email' => 'sometimes|email|max:255',
            'preferred_language' => 'sometimes|in:en,dv,ar',
        ]);

        $customer->update($validated);

        return response()->json([
            'message' => 'Profile updated successfully',
            'customer' => $customer,
        ]);
    }

    /**
     * Update internal staff notes on a customer (staff-only).
     */
    public function updateNotes(Request $request, int $id)
    {
        $customer = Customer::findOrFail($id);

        $validated = $request->validate([
            'internal_notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $customer->update($validated);

        return response()->json(['customer' => $customer]);
    }

    /**
     * Opt out of SMS promotions.
     */
    public function optOut(CustomerSmsOptOutRequest $request)
    {
        // Always return 200 regardless of whether the phone is registered — prevents phone enumeration
        Customer::where('phone', $request->validated()['phone'])
            ->update(['sms_opt_out' => true, 'sms_opt_out_at' => now()]);

        return response()->json(['message' => 'If this number is registered, you have been opted out.']);
    }
}
