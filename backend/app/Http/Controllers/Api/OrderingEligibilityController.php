<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Http\Controllers\Controller;
use App\Models\MenuGroup;
use Illuminate\Http\JsonResponse;

/**
 * Public ordering eligibility (delivery gate, active menu groups) for customer apps.
 */
class OrderingEligibilityController extends Controller
{
    public function __construct(
        private KitchenMenuResolver $kitchenMenuResolver,
    ) {}

    public function show(): JsonResponse
    {
        $accepting = $this->kitchenMenuResolver->isDeliveryServiceAccepting();
        $activeIds = $this->kitchenMenuResolver->activeMenuGroupIds();
        $groups = MenuGroup::query()
            ->whereIn('id', $activeIds)
            ->orderBy('sort_order')
            ->get(['id', 'name', 'slug']);

        return response()->json([
            'delivery' => [
                'accepting' => $accepting,
                'reason' => $accepting ? null : 'paused',
                'message' => $accepting ? null : $this->kitchenMenuResolver->deliveryUnavailableMessage(),
            ],
            'active_menu_groups' => $groups,
        ]);
    }
}
