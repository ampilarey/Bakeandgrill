<?php

declare(strict_types=1);

namespace App\Domains\Orders\Services;

use App\Domains\Permissions\Services\PermissionService;
use App\Models\Order;
use App\Models\User;

/**
 * Staff order visibility rules for POS list/show (station vs own orders).
 */
class OrderVisibilityService
{
    public function __construct(
        private readonly PermissionService $permissions,
    ) {}

    public function staffCanViewOrder(User $user, Order $order): bool
    {
        if ($this->permissions->hasPermission($user, 'pos.view_all_station_orders')) {
            return true;
        }
        if ((int) $order->user_id === (int) $user->id) {
            return true;
        }
        if (in_array($order->type, ['online_pickup', 'delivery'], true)) {
            return true;
        }

        return $this->isHandoffVisibleOrder($order);
    }

    public function isHandoffVisibleOrder(Order $order): bool
    {
        return !in_array($order->status, ['cancelled', 'refunded', 'completed'], true);
    }
}
