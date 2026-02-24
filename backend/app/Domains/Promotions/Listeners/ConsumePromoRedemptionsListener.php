<?php

declare(strict_types=1);

namespace App\Domains\Promotions\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Models\OrderPromotion;
use App\Models\PromotionRedemption;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Converts draft OrderPromotion records into final PromotionRedemption records
 * when an order is fully paid.
 *
 * Idempotent: protected by unique constraint on (promotion_id, order_id) in promotion_redemptions.
 */
class ConsumePromoRedemptionsListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public function handle(OrderPaid $event): void
    {
        $order = $event->order;

        $draftPromotions = OrderPromotion::where('order_id', $order->id)
            ->where('status', 'draft')
            ->with('promotion')
            ->get();

        if ($draftPromotions->isEmpty()) {
            return;
        }

        DB::transaction(function () use ($order, $draftPromotions): void {
            foreach ($draftPromotions as $orderPromo) {
                $idempotencyKey = 'promo:redeem:' . $order->id . ':' . $orderPromo->promotion_id;

                PromotionRedemption::firstOrCreate(
                    ['idempotency_key' => $idempotencyKey],
                    [
                        'promotion_id' => $orderPromo->promotion_id,
                        'order_id' => $order->id,
                        'customer_id' => $order->customer_id,
                        'discount_laar' => $orderPromo->discount_laar,
                        'redeemed_at' => now(),
                    ],
                );

                $orderPromo->update(['status' => 'consumed']);

                // Atomically increment redemptions_count
                DB::table('promotions')
                    ->where('id', $orderPromo->promotion_id)
                    ->increment('redemptions_count');

                Log::info('Promo redeemed', [
                    'promotion_id' => $orderPromo->promotion_id,
                    'order_id' => $order->id,
                    'discount_laar' => $orderPromo->discount_laar,
                ]);
            }
        });
    }
}
