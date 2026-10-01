<?php

declare(strict_types=1);

namespace App\Domains\Promotions\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Promotions\Repositories\PromotionRepositoryInterface;
use App\Domains\Promotions\Services\InLinePromotionGate;
use App\Models\OrderItem;
use App\Models\Promotion;
use App\Models\PromotionRedemption;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Counts an automatic item or category promotion as used when the order it
 * priced is paid (pricing audit, 2026-10-01, finding 1).
 *
 * The promotion priced the lines directly (order_items.promotion_id), so there
 * is no draft OrderPromotion for ConsumePromoRedemptionsListener to convert.
 * This writes the same PromotionRedemption the code path writes, one per
 * promotion per order, and moves the same two counters. A full refund
 * releases it through ReleasePromoRedemptionOnRefundListener like any other.
 */
class RecordInLinePromotionRedemptionsListener
{
    public bool $afterCommit = true;

    public function __construct(private PromotionRepositoryInterface $promotions) {}

    public function handle(OrderPaid $event): void
    {
        $orderId = $event->data->orderId;

        $lines = OrderItem::query()
            ->where('order_id', $orderId)
            ->whereNotNull('promotion_id')
            ->get(['promotion_id', 'unit_price', 'original_unit_price', 'quantity']);

        if ($lines->isEmpty()) {
            return;
        }

        DB::transaction(function () use ($lines, $orderId, $event): void {
            foreach ($lines->groupBy('promotion_id') as $promotionId => $promoLines) {
                $promotion = Promotion::query()->whereKey((int) $promotionId)->lockForUpdate()->first();
                if (!$promotion) {
                    continue;
                }

                $discountLaar = InLinePromotionGate::discountLaar($promoLines);

                $redemption = PromotionRedemption::firstOrCreate(
                    ['idempotency_key' => 'promo:inline:' . $orderId . ':' . $promotion->id],
                    [
                        'promotion_id' => $promotion->id,
                        'order_id' => $orderId,
                        'customer_id' => $event->data->customerId,
                        'discount_laar' => $discountLaar,
                        'redeemed_at' => now(),
                        'status' => 'active',
                    ],
                );

                if (!$redemption->wasRecentlyCreated) {
                    continue;
                }

                $this->promotions->incrementRedemptionsCount($promotion->id);
                $this->promotions->incrementSpentLaar($promotion->id, $discountLaar);

                Log::info('In-line promotion redeemed', [
                    'promotion_id' => $promotion->id,
                    'order_id' => $orderId,
                    'discount_laar' => $discountLaar,
                ]);
            }
        });
    }
}
