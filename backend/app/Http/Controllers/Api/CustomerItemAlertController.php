<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Menu\Services\ItemAlerts;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemAlert;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** "Tell me when it's back / on sale" for a signed-in customer (iruali import plan, feature 8). */
class CustomerItemAlertController extends Controller
{
    public function __construct(private readonly ItemAlerts $alerts) {}

    /** GET /api/customer/item-alerts: the dishes this customer is waiting for. */
    public function index(Request $request): JsonResponse
    {
        return response()->json(['item_ids' => ItemAlert::query()->where('customer_id', $this->customer($request)->id)->whereNull('sent_at')->pluck('item_id')->all()]);
    }

    /** POST /api/customer/items/{item}/alert */
    public function store(Request $request, Item $item): JsonResponse
    {
        abort_unless($item->is_active, 404);
        if ($item->isOrderableNow()) {
            return response()->json(['message' => 'You can order it now.', 'waiting' => false], 422);
        }
        $alert = $this->alerts->subscribe($this->customer($request), $item);

        return response()->json(['waiting' => true, 'kind' => $alert->kind]);
    }

    /** DELETE /api/customer/items/{item}/alert */
    public function destroy(Request $request, Item $item): JsonResponse
    {
        $this->alerts->unsubscribe($this->customer($request), $item);

        return response()->json(['waiting' => false]);
    }

    private function customer(Request $request): Customer
    {
        $customer = $request->user();
        abort_unless($customer instanceof Customer, 403);

        return $customer;
    }
}
