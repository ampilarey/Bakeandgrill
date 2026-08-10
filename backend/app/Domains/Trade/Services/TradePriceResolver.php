<?php

declare(strict_types=1);

namespace App\Domains\Trade\Services;

use App\Domains\Shared\ValueObjects\Money;
use App\Domains\Trade\DTOs\ResolvedTradePrice;
use App\Models\Item;
use App\Models\TradeAccount;
use App\Models\TradePriceListEntry;
use App\Models\Variant;

/**
 * Single wholesale price resolver — used by dispatch, invoices, preview
 * and admin screens. Never reads promotions, specials, combos or
 * channel prices. See docs/WHOLESALE_CONSIGNMENT_PLAN.md §3.2.
 */
final class TradePriceResolver
{
    public function resolve(
        TradeAccount $account,
        Item $item,
        ?Variant $variant = null,
    ): ResolvedTradePrice {
        $listPrice = $this->accountListPrice($account, $item, $variant);
        if ($listPrice !== null) {
            return ResolvedTradePrice::of($listPrice, ResolvedTradePrice::SOURCE_ACCOUNT_LIST);
        }

        if ($item->wholesale_price_laar !== null) {
            return ResolvedTradePrice::of(
                (int) $item->wholesale_price_laar,
                ResolvedTradePrice::SOURCE_ITEM_WHOLESALE,
            );
        }

        if ($account->default_discount_bp === null) {
            return ResolvedTradePrice::none();
        }

        $retailLaar = $this->baseRetailLaar($item, $variant);
        if ($retailLaar === null) {
            return ResolvedTradePrice::none();
        }

        $discount = (new Money($retailLaar))->percentageDiscount((int) $account->default_discount_bp);
        $priceLaar = $retailLaar - $discount->amountLaar;

        return ResolvedTradePrice::of($priceLaar, ResolvedTradePrice::SOURCE_RETAIL_DISCOUNT);
    }

    private function accountListPrice(
        TradeAccount $account,
        Item $item,
        ?Variant $variant,
    ): ?int {
        $query = TradePriceListEntry::query()
            ->where('trade_account_id', $account->id)
            ->where('item_id', $item->id)
            ->where('is_active', true);

        if ($variant !== null) {
            $query->where('variant_id', $variant->id);
        } else {
            $query->whereNull('variant_id');
        }

        $entry = $query->first();
        if ($entry === null) {
            return null;
        }

        // 0 is a legitimate agreed price — do not treat as unset.
        return (int) $entry->price_laar;
    }

    /**
     * Plain catalog retail in laari. Item.base_price / Variant.price only —
     * never displayPrice(), never EffectivePriceService.
     */
    private function baseRetailLaar(Item $item, ?Variant $variant): ?int
    {
        if ($variant !== null) {
            return Money::fromMvr($variant->price)->amountLaar;
        }

        if ($item->base_price === null) {
            return null;
        }

        return Money::fromMvr($item->base_price)->amountLaar;
    }
}
