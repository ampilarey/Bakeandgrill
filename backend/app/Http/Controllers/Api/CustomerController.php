<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Customers\Services\CustomerCreditService;
use App\Domains\Loyalty\Services\PointsCalculator;
use App\Domains\Reporting\Support\ReportMoneySql;
use App\Http\Controllers\Controller;
use App\Http\Requests\CustomerSmsOptOutRequest;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\LoyaltyAccount;
use App\Models\LoyaltyLedger;
use App\Models\Order;
use App\Services\AuditLogService;
use App\Support\OrderSettlement;
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

        // No-query mode: the POS Customer Picker calls this with an
        // empty `q` when it opens. We return the 50 most-recent
        // customers and explicitly INCLUDE customers who have never
        // ordered (sort falls back to created_at) — the old
        // whereNotNull('last_order_at') filter hid every brand-new
        // customer the manager just imported, which made the picker
        // look like the only people in the system were the 10
        // existing regulars. 50 is a deliberate cap: enough to scroll
        // and recognise a regular, not so much we ship the whole
        // table over the wire on every ticket. The cashier types ≥2
        // chars to search the full list.
        $limit = max(1, min(100, (int) $request->query('limit', 50)));
        if (mb_strlen($q) < 2) {
            $recent = Customer::query()
                ->select(['id', 'name', 'phone', 'email', 'loyalty_points', 'tier', 'sms_opt_out', 'last_order_at', 'created_at'])
                ->withCount('orders')
                ->orderByRaw('COALESCE(last_order_at, created_at) DESC')
                ->limit($limit)
                ->get();

            return response()->json([
                'data' => $recent,
                'total' => Customer::count(),
                'limit' => $limit,
            ]);
        }

        // If it looks like a phone number, normalise so "+960 712-3456",
        // "+9607123456" and "07123456" all hit the same row.
        $normalised = null;
        if (preg_match('/^\+?[\d\s\-]+$/', $q)) {
            try {
                $normalised = PhoneNormalizer::normalize($q);
            } catch (\Throwable) { /* fall back to LIKE */
            }
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
    /**
     * POS-scoped customer profile update. Lets a cashier add a name
     * (or fix a typo'd one / set an email) on a customer who was
     * registered phone-only.
     *
     * Phone is intentionally NOT editable here — it's the
     * idempotency key used by quick-attach and SMS delivery, so a
     * cashier mis-typing a new phone could silently merge two
     * customers' history. If a phone really needs to change, the
     * owner does it from Admin → Customers where there's a full
     * audit trail.
     */
    public function updateFromPos(Request $request, int $id)
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $data = $request->validate([
            'name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'email' => ['sometimes', 'nullable', 'email', 'max:120'],
        ]);

        $customer = Customer::findOrFail($id);
        // $data only contains keys the request sent (sometimes rule),
        // so this is a partial update — sending {"name": "Ahmed"}
        // won't null out the email and vice versa. Allowing explicit
        // null is intentional: cashier may want to wipe a wrong name.
        $customer->update($data);

        return response()->json(['customer' => $customer->fresh()]);
    }

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
            'name' => 'nullable|string|max:120',
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
     * Compact customer "dashboard" for the POS Customer chip.
     *
     * Staff-only — uses the same `staff.token` ability as `search` /
     * `quickCreate`. Designed to be called ONCE when the cashier attaches
     * a customer to a ticket. Returns:
     *   - profile basics (name, phone, tier, sms_opt_out, internal_notes)
     *   - true loyalty balance from `loyalty_accounts` (NOT the stale
     *     `customers.loyalty_points` column — that one isn't updated by
     *     LoyaltyLedgerService and drifts over time)
     *   - lifetime stats (orders count, total spent in MVR, first/last
     *     order timestamps) — derived from paid orders only so a
     *     cancelled cart doesn't inflate "lifetime value"
     *   - last 5 paid orders (id, number, type, total, paid_at) so the
     *     cashier can recognise a regular and reorder their usual
     *
     * Designed for fast round-trips: 1 customer row + 1 loyalty row + 1
     * stats query + 1 recent-orders query. Lifetime computed from
     * `paid_at` rather than `created_at` so abandoned orders don't pad
     * the numbers.
     */
    public function posSummary(Request $request, int $id)
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        /** @var Customer $customer */
        $customer = Customer::findOrFail($id);

        // Loyalty: prefer the ledger-backed account (source of truth).
        // Falls back to `customers.loyalty_points` for very old rows
        // that pre-date the ledger system.
        $loyalty = LoyaltyAccount::where('customer_id', $customer->id)->first();
        $loyaltyPayload = $loyalty
            ? [
                'points_balance' => (int) $loyalty->points_balance,
                'points_held' => (int) $loyalty->points_held,
                'available_points' => (int) max(0, $loyalty->points_balance - $loyalty->points_held),
                'lifetime_points' => (int) $loyalty->lifetime_points,
                'tier' => $loyalty->tier ?? $customer->tier,
            ]
            : [
                'points_balance' => (int) ($customer->loyalty_points ?? 0),
                'points_held' => 0,
                'available_points' => (int) ($customer->loyalty_points ?? 0),
                'lifetime_points' => (int) ($customer->loyalty_points ?? 0),
                'tier' => $customer->tier ?? 'bronze',
            ];

        // Lifetime stats — only count orders that actually got paid so
        // a cashier doesn't see "10 orders" when 7 were cancelled.
        $totalLaarExpr = ReportMoneySql::ORDER_TOTAL_LAAR;
        $stats = Order::query()
            ->where('customer_id', $customer->id)
            ->whereNotNull('paid_at')
            ->selectRaw('COUNT(*) as orders_count')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr($totalLaarExpr).' as total_spent')
            ->selectRaw('MIN(paid_at) as first_paid_at, MAX(paid_at) as last_paid_at')
            ->first();

        $recent = Order::query()
            ->where('customer_id', $customer->id)
            ->whereNotNull('paid_at')
            ->orderByDesc('paid_at')
            ->limit(5)
            ->get(['id', 'order_number', 'type', 'status', 'total', 'paid_at'])
            ->map(fn ($o) => [
                'id' => (int) $o->id,
                'order_number' => $o->order_number,
                'type' => $o->type,
                'status' => $o->status,
                'total' => (float) $o->total,
                'paid_at' => $o->paid_at?->toIso8601String(),
            ]);

        return response()->json([
            'customer' => [
                'id' => (int) $customer->id,
                'name' => $customer->name,
                'phone' => $customer->phone,
                'email' => $customer->email,
                'tier' => $customer->tier ?? 'bronze',
                'sms_opt_out' => (bool) $customer->sms_opt_out,
                'internal_notes' => $customer->internal_notes,
                'created_at' => $customer->created_at?->toIso8601String(),
            ],
            'loyalty' => array_merge($loyaltyPayload, [
                'redeem_mvr_per_point' => app(PointsCalculator::class)->redeemRatePerPoint(),
            ]),
            'lifetime' => [
                'orders_count' => (int) ($stats?->orders_count ?? 0),
                'total_spent' => (float) ($stats?->total_spent ?? 0),
                'first_paid_at' => $stats?->first_paid_at instanceof \DateTimeInterface
                    ? $stats->first_paid_at->format(\DateTime::ATOM)
                    : ($stats?->first_paid_at ?? null),
                'last_paid_at' => $stats?->last_paid_at instanceof \DateTimeInterface
                    ? $stats->last_paid_at->format(\DateTime::ATOM)
                    : ($stats?->last_paid_at ?? null),
            ],
            'recent_orders' => $recent,
            'credit' => app(CustomerCreditService::class)->creditSummary($customer),
        ]);
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
                'date_of_birth' => $customer->date_of_birth?->format('Y-m-d'),
                'loyalty_points' => $customer->loyalty_points,
                'tier' => $customer->tier,
                'preferred_language' => $customer->preferred_language,
                'last_order_at' => $customer->last_order_at,
            ],
            'credit' => $customer->credit_enabled
                ? app(CustomerCreditService::class)->customerFacingSummary($customer)
                : null,
        ]);
    }

    /**
     * GET /api/customer/credit — balance, limit, and open invoices.
     */
    public function credit(Request $request)
    {
        $customer = $request->user();

        if (!$customer instanceof Customer) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        if (!$customer->credit_enabled) {
            return response()->json(['credit' => null]);
        }

        $creditService = app(CustomerCreditService::class);

        return response()->json([
            'credit' => array_merge(
                $creditService->customerFacingSummary($customer),
                ['open_invoices' => $this->formatCustomerCreditInvoices($customer, $creditService)],
            ),
        ]);
    }

    /**
     * PATCH /api/customer/credit/preferences — reminder SMS opt-out.
     */
    public function updateCreditPreferences(Request $request)
    {
        $customer = $request->user();

        if (!$customer instanceof Customer) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        if (!$customer->credit_enabled) {
            return response()->json(['message' => 'Credit account is not active.'], 422);
        }

        $validated = $request->validate([
            'credit_reminder_sms' => ['required', 'boolean'],
        ]);

        $updated = app(CustomerCreditService::class)->updateCustomerReminderPreference(
            $customer,
            (bool) $validated['credit_reminder_sms'],
        );

        return response()->json([
            'credit' => array_merge(
                app(CustomerCreditService::class)->customerFacingSummary($updated),
                ['open_invoices' => $this->formatCustomerCreditInvoices($updated, app(CustomerCreditService::class))],
            ),
        ]);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function formatCustomerCreditInvoices(Customer $customer, CustomerCreditService $creditService): array
    {
        $tokens = Invoice::query()
            ->whereIn('id', collect($creditService->openCreditInvoices($customer))->pluck('id'))
            ->pluck('token', 'id');

        return collect($creditService->openCreditInvoices($customer))
            ->map(function (array $inv) use ($tokens) {
                return [
                    'id' => $inv['id'],
                    'invoice_number' => $inv['invoice_number'],
                    'order_id' => $inv['order_id'],
                    'status' => $inv['status'],
                    'issue_date' => $inv['issue_date'],
                    'due_date' => $inv['due_date'] ?? null,
                    'total_mvr' => round($inv['total_laar'] / 100, 2),
                    'amount_paid_mvr' => round($inv['amount_paid_laar'] / 100, 2),
                    'balance_due_mvr' => round($inv['balance_due_laar'] / 100, 2),
                    'view_url' => isset($tokens[$inv['id']])
                        ? url('/invoices/' . $tokens[$inv['id']])
                        : null,
                ];
            })
            ->values()
            ->all();
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

        $orders->through(function (Order $order) {
            $data = $order->toArray();
            $data['payment_settlement'] = OrderSettlement::forOrder($order);

            return $data;
        });

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
            ->with(['items.modifiers', 'items.item', 'payments'])
            ->findOrFail($id);

        $loyaltyPointsEarned = (int) LoyaltyLedger::query()
            ->where('order_id', $order->id)
            ->where('customer_id', $customer->id)
            ->where('type', 'earn')
            ->sum('points');

        return response()->json([
            'order' => array_merge([
                'id' => $order->id,
                'order_number' => $order->order_number,
                'status' => $order->status,
                'payment_status' => $order->payment_status,
                'type' => $order->type,
                'total' => (float) $order->total,
                'total_laar' => (int) ($order->total_laar ?? round((float) $order->total * 100)),
                'subtotal' => (float) ($order->subtotal ?? $order->total),
                'tax_amount' => $order->tax_amount !== null ? (float) $order->tax_amount : null,
                'delivery_fee' => (float) ($order->delivery_fee ?? 0),
                'promo_discount_laar' => (int) ($order->promo_discount_laar ?? 0),
                'loyalty_discount_laar' => (int) ($order->loyalty_discount_laar ?? 0),
                'gift_card_discount_laar' => (int) ($order->gift_card_discount_laar ?? 0),
                'referral_discount_laar' => (int) ($order->referral_discount_laar ?? 0),
                'remaining_balance_laar' => app(\App\Domains\Payments\Services\PaymentService::class)
                    ->getRemainingBalanceLaar($order),
                'loyalty_points_earned' => $loyaltyPointsEarned,
                'paid_at' => $order->paid_at?->toIso8601String(),
                'created_at' => $order->created_at->toIso8601String(),
                'items' => $order->items->map(fn ($item) => [
                    'id' => $item->id,
                    'item_id' => $item->item_id,
                    'item_name' => $item->item_name,
                    'variant_name' => $item->variant_name,
                    'quantity' => $item->quantity,
                    'unit_price' => (float) $item->unit_price,
                    'total_price' => (float) $item->total_price,
                    'notes' => $item->notes,
                    'modifiers' => $item->modifiers->map(fn ($m) => [
                        'id' => $m->id,
                        'name' => $m->modifier_name,
                        'modifier_name' => $m->modifier_name,
                        'modifier_price' => (float) $m->modifier_price,
                    ])->values(),
                ])->values(),
                // Delivery fields
                'delivery_address_line1' => $order->delivery_address_line1,
                'delivery_address_line2' => $order->delivery_address_line2,
                'delivery_island' => $order->delivery_island,
                'delivery_contact_name' => $order->delivery_contact_name,
                'delivery_contact_phone' => $order->delivery_contact_phone,
                'delivery_notes' => $order->delivery_notes,
                'pickup_slot_at' => $order->pickup_slot_at?->toIso8601String(),
                'estimated_wait_minutes' => $order->estimated_wait_minutes,
                'proof_of_delivery_url' => $order->proof_of_delivery_path
                    ? \Illuminate\Support\Facades\Storage::disk('public')->url($order->proof_of_delivery_path)
                    : null,
            ], [
                'payment_settlement' => OrderSettlement::forOrder($order),
            ]),
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
            'date_of_birth' => 'sometimes|nullable|date|before:today|after:1900-01-01',
        ]);

        $customer->update($validated);
        $customer->refresh();

        return response()->json([
            'message' => 'Profile updated successfully',
            'customer' => [
                'id' => $customer->id,
                'phone' => $customer->phone,
                'name' => $customer->name,
                'email' => $customer->email,
                'date_of_birth' => $customer->date_of_birth?->format('Y-m-d'),
                'loyalty_points' => $customer->loyalty_points,
                'tier' => $customer->tier,
                'preferred_language' => $customer->preferred_language,
                'is_profile_complete' => $customer->is_profile_complete,
            ],
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
