<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class AdminCustomerController extends Controller
{
    /**
     * GET /admin/customers
     * Paginated list with search and active filter.
     */
    public function index(Request $request): JsonResponse
    {
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
            'data' => collect($paginator->items())->map(fn(Customer $c) => $this->format($c)),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'total'        => $paginator->total(),
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
            'orders'   => $orders,
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
            'name'           => ['sometimes', 'string', 'max:255'],
            'email'          => ['sometimes', 'nullable', 'email', 'max:255'],
            'internal_notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'is_active'      => ['sometimes', 'boolean'],
            'sms_opt_out'    => ['sometimes', 'boolean'],
        ]);

        $customer->update($validated);

        return response()->json(['customer' => $this->format($customer->fresh())]);
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
            'id'              => $c->id,
            'name'            => $c->name,
            'phone'           => $c->phone,
            'email'           => $c->email,
            'tier'            => $c->tier,
            'loyalty_points'  => $c->loyalty_points,
            'is_active'       => (bool) $c->is_active,
            'is_profile_complete' => (bool) $c->is_profile_complete,
            'sms_opt_out'     => (bool) $c->sms_opt_out,
            'internal_notes'  => $c->internal_notes,
            'preferred_language' => $c->preferred_language,
            'orders_count'    => $c->orders_count ?? 0,
            'last_login_at'   => $c->last_login_at,
            'last_order_at'   => $c->last_order_at,
            'created_at'      => $c->created_at,
        ];
    }
}
