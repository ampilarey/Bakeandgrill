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
        // 1) Variant-specific row when a variant was requested.
        if ($variant !== null) {
            $variantEntry = TradePriceListEntry::query()
                ->where('trade_account_id', $account->id)
                ->where('item_id', $item->id)
                ->where('variant_id', $variant->id)
                ->where('is_active', true)
                ->first();

            if ($variantEntry !== null) {
                // 0 is a legitimate agreed price — do not treat as unset.
                return (int) $variantEntry->price_laar;
            }
        }

        // 2) Item-level row (variant_id null) — also the fallback when a
        //    variant was requested but has no own row. Skipping this step
        //    previously sent variants through retail_discount and could
        //    more than double the agreed shop price.
        $itemEntry = TradePriceListEntry::query()
            ->where('trade_account_id', $account->id)
            ->where('item_id', $item->id)
            ->whereNull('variant_id')
            ->where('is_active', true)
            ->first();

        if ($itemEntry === null) {
            return null;
        }

        return (int) $itemEntry->price_laar;
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
