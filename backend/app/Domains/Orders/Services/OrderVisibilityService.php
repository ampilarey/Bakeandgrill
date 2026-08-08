<?php

declare(strict_types=1);

namespace App\Domains\Orders\Services;

use App\Domains\Permissions\Services\PermissionService;
use App\Models\Order;
use App\Models\User;

/**
 * Staff order visibility rules for POS list/show (station vs own orders).
 *
 * Full detail (customer + payments) requires an explicit POS/orders permission
 * or ownership. Kitchen/KDS handoff may see a sanitized summary of live tickets.
 */
class OrderVisibilityService
{
    public function __construct(
        private readonly PermissionService $permissions,
    ) {}

    public function staffCanViewOrder(User $user, Order $order): bool
    {
        return $this->staffCanViewFullOrder($user, $order)
            || $this->staffCanViewKitchenSummary($user, $order);
    }

    /**
     * Full order payload including customer PII and payment rows.
     *
     * Terminal sales (completed / cancelled / refunded) require ownership or an
     * elevated station/orders permission. `pos.ring_sales` alone only unlocks
     * live tickets so a cashier can settle a parked handover — not another
     * cashier's finished receipt.
     */
    public function staffCanViewFullOrder(User $user, Order $order): bool
    {
        if ((int) $order->user_id === (int) $user->id) {
            return true;
        }
        if ($this->permissions->hasPermission($user, 'pos.view_all_station_orders')) {
            return true;
        }
        if ($this->permissions->hasPermission($user, 'orders.manage')) {
            return true;
        }
        // Live tickets only — not completed/cancelled/refunded receipts.
        if ($this->permissions->hasPermission($user, 'pos.ring_sales')
            && $this->isHandoffVisibleOrder($order)) {
            return true;
        }

        return false;
    }

    /**
     * Minimal kitchen/handoff view of a non-terminal ticket.
     */
    public function staffCanViewKitchenSummary(User $user, Order $order): bool
    {
        if (!$this->isHandoffVisibleOrder($order)) {
            return false;
        }

        foreach ([
            'kds.view',
            'kds.start_order',
            'kds.bump_order',
            'kds.mark_kitchen_done',
            'kds.recall_order',
            'kds.print_ticket',
            'kitchen.production.view_all',
            'kitchen.production.view_own',
            'kitchen.receiving.view',
            'kitchen.receiving.receive',
            'kitchen.receiving.manage',
        ] as $slug) {
            if ($this->permissions->hasPermission($user, $slug)) {
                return true;
            }
        }

        return false;
    }

    public function isHandoffVisibleOrder(Order $order): bool
    {
        return !in_array($order->status, ['cancelled', 'refunded', 'completed'], true);
    }

    /**
     * Sanitized payload for kitchen/KDS — no customer PII or payment details.
     *
     * @return array<string, mixed>
     */
    public function kitchenSummary(Order $order): array
    {
        $order->loadMissing(['items.modifiers', 'table:id,name', 'user:id,name']);

        return [
            'id' => $order->id,
            'order_number' => $order->order_number,
            'type' => $order->type,
            'status' => $order->status,
            'kitchen_status' => $order->kitchen_status ?? null,
            'kitchen_handover_status' => $order->kitchen_handover_status ?? null,
            'ticket_name' => $order->ticket_name ?? null,
            'ticket_note' => $order->ticket_note ?? null,
            'customer_notes' => $order->customer_notes ?? null,
            'table' => $order->table ? [
                'id' => $order->table->id,
                'name' => $order->table->name,
            ] : null,
            'user' => $order->user ? [
                'id' => $order->user->id,
                'name' => $order->user->name,
            ] : null,
            'items' => $order->items->map(static function ($item) {
                return [
                    'id' => $item->id,
                    'item_id' => $item->item_id,
                    'name' => $item->name ?? $item->item_name ?? null,
                    'quantity' => $item->quantity,
                    'status' => $item->status,
                    'notes' => $item->notes,
                    'kitchen_received_qty' => $item->kitchen_received_qty ?? null,
                    'modifiers' => $item->modifiers->map(static fn ($m) => [
                        'id' => $m->id,
                        'name' => $m->name ?? null,
                        'quantity' => $m->quantity ?? 1,
                    ])->values()->all(),
                ];
            })->values()->all(),
            'created_at' => $order->created_at,
            'updated_at' => $order->updated_at,
        ];
    }
}
