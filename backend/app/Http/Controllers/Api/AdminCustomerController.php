<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Customers\Services\CustomerSegmentationService;
use App\Models\Customer;
use App\Rules\MaldivesPhone;
use App\Services\CustomerAccountService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class AdminCustomerController extends Controller
{
    /**
     * GET /admin/customers
     * Paginated list with search and active filter.
     */
    public function index(Request $request, CustomerSegmentationService $segments): JsonResponse
    {
        if ($request->filled('segment')) {
            $paginator = $segments->customersInSegment($request->query('segment'), [
                'search' => $request->query('search'),
                'page' => $request->integer('page', 1),
            ]);

            return response()->json([
                'data' => $paginator->items(),
                'meta' => [
                    'current_page' => $paginator->currentPage(),
                    'last_page' => $paginator->lastPage(),
                    'total' => $paginator->total(),
                ],
            ]);
        }

        $query = Customer::withCount('orders')
            ->orderByDesc('created_at');

        if ($search = $request->query('search')) {
            $like = '%' . $search . '%';
            $query->where(function ($q) use ($like) {
                $q->where('name', 'like', $like)
                    ->orWhere('phone', 'like', $like)
                    ->orWhere('email', 'like', $like);
            });
        }

        if ($request->filled('is_active')) {
            $query->where('is_active', filter_var($request->query('is_active'), FILTER_VALIDATE_BOOLEAN));
        }

        $paginator = $query->paginate(30);

        return response()->json([
            'data' => collect($paginator->items())->map(function (Customer $c) use ($segments) {
                $row = $this->format($c);
                $row['badges'] = $segments->badgesForCustomer($c);

                return $row;
            }),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    /**
     * GET /admin/customers/{id}
     * Customer detail with last 10 orders.
     */
    public function show(int $id): JsonResponse
    {
        $customer = Customer::withCount('orders')->findOrFail($id);

        $orders = $customer->orders()
            ->select('id', 'order_number', 'status', 'type', 'total', 'created_at', 'paid_at')
            ->orderByDesc('created_at')
            ->limit(10)
            ->get();

        return response()->json([
            'customer' => $this->format($customer),
            'orders' => $orders,
        ]);
    }

    /**
     * PATCH /admin/customers/{id}
     * Edit customer fields: name, email, internal_notes, is_active, sms_opt_out.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'date_of_birth' => ['sometimes', 'nullable', 'date', 'before:today', 'after:1900-01-01'],
            'internal_notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'is_active' => ['sometimes', 'boolean'],
            'sms_opt_out' => ['sometimes', 'boolean'],
        ]);

        $customer->update($validated);

        return response()->json(['customer' => $this->format($customer->fresh())]);
    }

    /**
     * PATCH /admin/customers/{id}/phone
     * Change account phone (login identity). Revokes active customer sessions.
     */
    public function changePhone(Request $request, int $id, CustomerAccountService $accounts): JsonResponse
    {
        $customer = Customer::findOrFail($id);

        $validated = $request->validate([
            'phone' => ['required', 'string', new MaldivesPhone],
        ]);

        $result = $accounts->changePhone($customer, $validated['phone'], $request);

        return response()->json([
            'message' => 'Phone number updated. The customer must log in again with the new number.',
            'customer' => $this->format($result['customer']),
            'revoked_tokens' => $result['revoked_tokens'],
        ]);
    }

    /**
     * POST /admin/customers/{id}/merge
     * Merge duplicate accounts into this (primary) customer.
     */
    public function merge(Request $request, int $id, CustomerAccountService $accounts): JsonResponse
    {
        $primary = Customer::findOrFail($id);

        $validated = $request->validate([
            'source_customer_ids' => ['required', 'array', 'min:1'],
            'source_customer_ids.*' => ['integer', 'distinct'],
        ]);

        $result = $accounts->mergeAccounts($primary, $validated['source_customer_ids'], $request);

        return response()->json([
            'message' => count($result['merged']) === 1
                ? '1 account merged successfully.'
                : count($result['merged']) . ' accounts merged successfully.',
            'customer' => $this->format($result['customer']->loadCount('orders')),
            'merged' => $result['merged'],
        ]);
    }

    /**
     * DELETE /admin/customers/{id}
     * Soft-delete the customer. Past orders remain linked.
     */
    public function destroy(int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $customer->delete(); // SoftDeletes — sets deleted_at

        return response()->json(['message' => 'Customer deactivated.']);
    }

    private function format(Customer $c): array
    {
        return [
            'id' => $c->id,
            'name' => $c->name,
            'phone' => $c->phone,
            'email' => $c->email,
            'date_of_birth' => $c->date_of_birth?->format('Y-m-d'),
            'tier' => $c->tier,
            'loyalty_points' => $c->loyalty_points,
            'is_active' => (bool) $c->is_active,
            'is_profile_complete' => (bool) $c->is_profile_complete,
            'sms_opt_out' => (bool) $c->sms_opt_out,
            'internal_notes' => $c->internal_notes,
            'preferred_language' => $c->preferred_language,
            'orders_count' => $c->orders_count ?? 0,
            'last_login_at' => $c->last_login_at,
            'last_order_at' => $c->last_order_at,
            'created_at' => $c->created_at,
            'credit_enabled' => (bool) ($c->credit_enabled ?? false),
            'credit_status' => $c->credit_status ?? 'blocked',
            'credit_limit_laar' => (int) ($c->credit_limit_laar ?? 0),
            'credit_balance_laar' => (int) ($c->credit_balance_laar ?? 0),
        ];
    }
}
