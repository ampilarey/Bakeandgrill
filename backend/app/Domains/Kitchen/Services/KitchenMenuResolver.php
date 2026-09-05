<?php

declare(strict_types=1);

namespace App\Domains\Kitchen\Services;

use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Models\KitchenMenuState;
use App\Models\MenuGroup;
use App\Models\SiteSetting;
use App\Services\DeliveryGateService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Resolves which items are orderable per sales channel and time, including
 * chef/menu-group duty and delivery service rules.
 */
final class KitchenMenuResolver
{
    public const CHANNELS = ['dine_in', 'takeaway', 'online_pickup', 'delivery', 'catering'];

    /**
     * Channels that can create sellable immediate orders.
     *
     * ARCHITECTURE RULE (docs/CATERING-EVENTS-PLAN.md §2): catering is a
     * display/availability flag only — NEVER add it here. The catering flag
     * by itself never makes an item orderable in immediate flows; orderability
     * comes only from dine_in / takeaway / online_pickup / delivery. Menu /
     * category membership never implies orderability either. Do not couple
     * these three concepts.
     */
    public const ORDERING_CHANNELS = ['dine_in', 'takeaway', 'online_pickup', 'delivery'];

    public function __construct(
        private readonly DeliveryGateService $deliveryGate,
    ) {}

    public function channelForOrderType(string $orderType): string
    {
        // Catering is availability-only — never map an order type to it.
        return match ($orderType) {
            'dine_in' => 'dine_in',
            'takeaway' => 'takeaway',
            'online_pickup' => 'online_pickup',
            'delivery' => 'delivery',
            'preorder' => 'online_pickup',
            'catering' => 'online_pickup',
            default => 'online_pickup',
        };
    }

    public function isDeliveryServiceAccepting(): bool
    {
        // Skip capacity — used for menu/channel visibility and mid-create asserts.
        // Capacity is enforced once in DeliveryOrderController::assertDeliveryOpen.
        return $this->deliveryGate->isDeliveryOpen(null, null, checkCapacity: false);
    }

    public function deliveryUnavailableMessage(): string
    {
        return (string) SiteSetting::get(
            'delivery_unavailable_message',
            'Delivery is paused right now. Please choose takeaway or try again later.',
        );
    }

    /**
     * @return list<int>
     */
    public function activeMenuGroupIds(): array
    {
        $state = KitchenMenuState::query()->whereKey(1)->first();
        if ($state === null || $state->active_menu_group_ids === null || $state->active_menu_group_ids === []) {
            return MenuGroup::where('is_active', true)->pluck('id')->all();
        }

        return array_values(array_map('intval', $state->active_menu_group_ids));
    }

    public function isItemVisibleForChannel(Item $item, string $channel, ?Carbon $at = null, bool $ignoreDeliveryGate = false): bool
    {
        $at ??= now();

        if (!$item->is_active || !$item->is_available) {
            return false;
        }

        if ($item->isSnoozed($at)) {
            return false;
        }

        if (!in_array($channel, self::CHANNELS, true)) {
            return false;
        }

        if ($item->menu_group_id !== null) {
            $active = $this->activeMenuGroupIds();
            if ($active !== [] && !in_array((int) $item->menu_group_id, $active, true)) {
                return false;
            }
        }

        $row = ItemChannelAvailability::query()
            ->where('item_id', $item->id)
            ->where('channel', $channel)
            ->first();

        if ($row === null || !$row->is_enabled) {
            return false;
        }

        if ($row->valid_from && $at->lt($row->valid_from)) {
            return false;
        }
        if ($row->valid_until && $at->gt($row->valid_until)) {
            return false;
        }

        if ($channel === 'delivery' && !$ignoreDeliveryGate && !$this->isDeliveryServiceAccepting()) {
            return false;
        }

        return true;
    }

    /**
     * @param iterable<Item> $items
     * @return list<int>
     */
    public function filterItemIdsForChannel(iterable $items, string $channel, ?Carbon $at = null): array
    {
        $ids = [];
        foreach ($items as $item) {
            if ($this->isItemVisibleForChannel($item, $channel, $at)) {
                $ids[] = (int) $item->id;
            }
        }

        return $ids;
    }

    /**
     * @param array<int, Item> $itemMap keyed by id
     * @param list<array{item_id: int}> $lineItems
     */
    /**
     * @param bool $skipDeliveryWindow Tomorrow (fulfil_date) orders: the current
     *                                 delivery window doesn't apply, but customer
     *                                 per-item channel rules still do.
     */
    public function assertLineItemsAllowedForOrderType(
        array $itemMap,
        array $lineItems,
        string $orderType,
        bool $ignoreDeliveryGate = false,
        bool $skipDeliveryWindow = false,
    ): void {
        $channel = $this->channelForOrderType($orderType);

        if ($channel === 'delivery' && !$ignoreDeliveryGate && !$skipDeliveryWindow && !$this->isDeliveryServiceAccepting()) {
            abort(422, $this->deliveryUnavailableMessage());
        }

        $bad = [];
        foreach ($lineItems as $line) {
            $id = (int) $line['item_id'];
            $item = $itemMap[$id] ?? null;
            if (!$item) {
                continue;
            }

            // Staff POS phone-in delivery: accept anything the in-store
            // menu would allow (dine-in / takeaway / pickup), not only
            // items explicitly flagged for the online delivery channel.
            if ($channel === 'delivery' && $ignoreDeliveryGate) {
                $staffChannels = ['dine_in', 'takeaway', 'online_pickup', 'delivery'];
                $allowed = false;
                foreach ($staffChannels as $staffChannel) {
                    if ($this->isItemVisibleForChannel($item, $staffChannel, null, true)) {
                        $allowed = true;
                        break;
                    }
                }
                if (!$allowed) {
                    $bad[] = $item->name;
                }
                continue;
            }

            if (!$this->isItemVisibleForChannel($item, $channel, null, $ignoreDeliveryGate || $skipDeliveryWindow)) {
                $bad[] = $item->name;
            }
        }

        if ($bad !== []) {
            abort(422, 'These items are not available for this order type: ' . implode(', ', $bad));
        }
    }

    /**
     * Apply channel + kitchen rules to a public items query builder.
     */
    /**
     * @param bool $keepDisabled Return items this channel has switched off
     *                           instead of dropping them, so the menu can show
     *                           them as unavailable rather than pretending they
     *                           do not exist. `ItemAvailabilityService::check`
     *                           already answers `channel_unavailable` for these,
     *                           and order creation still refuses them, so the
     *                           only thing this changes is whether a customer
     *                           can see that the dish is a thing you sell.
     */
    public function scopeItemsForChannel(
        \Illuminate\Database\Eloquent\Builder $query,
        string $channel,
        ?Carbon $at = null,
        bool $ignoreDeliveryGate = false,
        bool $keepDisabled = false,
    ): void {
        $at ??= now();

        $activeIds = $this->activeMenuGroupIds();

        /*
         * Menu groups stay a hard filter even when disabled items are kept.
         * A group that is not running is a menu that is not on — the breakfast
         * list greyed out all evening is noise, not information.
         */
        $query->where(function ($q) use ($activeIds) {
            $q->whereNull('items.menu_group_id');
            if ($activeIds !== []) {
                $q->orWhereIn('items.menu_group_id', $activeIds);
            }
        });

        if (!$keepDisabled) {
            $query->whereExists(function ($sub) use ($channel, $at) {
                $sub->select(DB::raw(1))
                    ->from('item_channel_availability as ica')
                    ->whereColumn('ica.item_id', 'items.id')
                    ->where('ica.channel', $channel)
                    ->where('ica.is_enabled', true)
                    ->where(function ($w) use ($at) {
                        $w->whereNull('ica.valid_from')->orWhere('ica.valid_from', '<=', $at);
                    })
                    ->where(function ($w) use ($at) {
                        $w->whereNull('ica.valid_until')->orWhere('ica.valid_until', '>=', $at);
                    });
            });
        } elseif (in_array($channel, self::ORDERING_CHANNELS, true)) {
            /*
             * One exception to keeping switched-off items: a catering-only
             * product. "Buffet Package for 50" greyed out across the takeaway
             * menu tells a customer nothing they can act on — it is not a dish
             * this channel sells and forgot to enable, it belongs to the events
             * wizard. Keep it out of the immediate menus as before.
             */
            $query->whereNot(function ($q) {
                $q->whereExists(function ($sub) {
                    $sub->select(DB::raw(1))
                        ->from('item_channel_availability as cat')
                        ->whereColumn('cat.item_id', 'items.id')
                        ->where('cat.channel', 'catering')
                        ->where('cat.is_enabled', true);
                })->whereNotExists(function ($sub) {
                    $sub->select(DB::raw(1))
                        ->from('item_channel_availability as ord')
                        ->whereColumn('ord.item_id', 'items.id')
                        ->whereIn('ord.channel', self::ORDERING_CHANNELS)
                        ->where('ord.is_enabled', true);
                });
            });
        }

        if ($channel === 'delivery' && !$ignoreDeliveryGate && !$this->isDeliveryServiceAccepting()) {
            $query->whereRaw('1 = 0');
        }
    }
}
