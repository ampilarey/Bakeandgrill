<?php

declare(strict_types=1);

namespace App\Domains\Kitchen\Services;

use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Models\KitchenMenuState;
use App\Models\MenuGroup;
use App\Models\SiteSetting;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Resolves which items are orderable per sales channel and time, including
 * chef/menu-group duty and delivery service rules.
 */
final class KitchenMenuResolver
{
    public const CHANNELS = ['dine_in', 'takeaway', 'online_pickup', 'delivery'];

    public function channelForOrderType(string $orderType): string
    {
        return match ($orderType) {
            'dine_in' => 'dine_in',
            'takeaway' => 'takeaway',
            'online_pickup' => 'online_pickup',
            'delivery' => 'delivery',
            'preorder' => 'online_pickup',
            default => 'online_pickup',
        };
    }

    public function isDeliveryServiceAccepting(): bool
    {
        $raw = SiteSetting::get('delivery_accepting_orders', '1');

        return filter_var($raw, FILTER_VALIDATE_BOOLEAN)
            || $raw === '1'
            || $raw === 1;
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

    public function isItemVisibleForChannel(Item $item, string $channel, ?Carbon $at = null): bool
    {
        $at ??= now();

        if (! $item->is_active || ! $item->is_available) {
            return false;
        }

        if (! in_array($channel, self::CHANNELS, true)) {
            return false;
        }

        if ($item->menu_group_id !== null) {
            $active = $this->activeMenuGroupIds();
            if ($active !== [] && ! in_array((int) $item->menu_group_id, $active, true)) {
                return false;
            }
        }

        $row = ItemChannelAvailability::query()
            ->where('item_id', $item->id)
            ->where('channel', $channel)
            ->first();

        if ($row === null || ! $row->is_enabled) {
            return false;
        }

        if ($row->valid_from && $at->lt($row->valid_from)) {
            return false;
        }
        if ($row->valid_until && $at->gt($row->valid_until)) {
            return false;
        }

        if ($channel === 'delivery' && ! $this->isDeliveryServiceAccepting()) {
            return false;
        }

        return true;
    }

    /**
     * @param  iterable<Item>  $items
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
     * @param  array<int, Item>  $itemMap  keyed by id
     * @param  list<array{item_id: int}>  $lineItems
     */
    public function assertLineItemsAllowedForOrderType(array $itemMap, array $lineItems, string $orderType): void
    {
        $channel = $this->channelForOrderType($orderType);

        if ($channel === 'delivery' && ! $this->isDeliveryServiceAccepting()) {
            abort(422, $this->deliveryUnavailableMessage());
        }

        $bad = [];
        foreach ($lineItems as $line) {
            $id = (int) $line['item_id'];
            $item = $itemMap[$id] ?? null;
            if (! $item) {
                continue;
            }
            if (! $this->isItemVisibleForChannel($item, $channel)) {
                $bad[] = $item->name;
            }
        }

        if ($bad !== []) {
            abort(422, 'These items are not available for this order type: '.implode(', ', $bad));
        }
    }

    /**
     * Apply channel + kitchen rules to a public items query builder.
     */
    public function scopeItemsForChannel(\Illuminate\Database\Eloquent\Builder $query, string $channel, ?Carbon $at = null): void
    {
        $at ??= now();

        $activeIds = $this->activeMenuGroupIds();

        $query->where(function ($q) use ($activeIds) {
            $q->whereNull('items.menu_group_id');
            if ($activeIds !== []) {
                $q->orWhereIn('items.menu_group_id', $activeIds);
            }
        });

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

        if ($channel === 'delivery' && ! $this->isDeliveryServiceAccepting()) {
            $query->whereRaw('1 = 0');
        }
    }
}
