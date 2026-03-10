<?php

declare(strict_types=1);

namespace App\Domains\Promotions\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Promotions\Repositories\PromotionRepositoryInterface;
use App\Models\OrderPromotion;
use App\Models\PromotionRedemption;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Converts draft OrderPromotion records into final PromotionRedemption records
 * when an order is fully paid.
 *
 * Runs synchronously (critical path) — promo redemptions must be committed
 * before the order response so usage limits are enforced in real time.
 * Idempotent: protected by unique constraint on (promotion_id, order_id).
 */
class ConsumePromoRedemptionsListener
{
    public function __construct(private PromotionRepositoryInterface $promotions) {}

    public function handle(OrderPaid $event): void
    {
        $orderId    = $event->data->orderId;
        $customerId = $event->data->customerId;

        $draftPromotions = OrderPromotion::where('order_id', $orderId)
            ->where('status', 'draft')
            ->get();

        if ($draftPromotions->isEmpty()) {
            return;
        }

        try {
            DB::transaction(function () use ($orderId, $customerId, $draftPromotions): void {
                foreach ($draftPromotions as $orderPromo) {
                    $idempotencyKey = 'promo:redeem:' . $orderId . ':' . $orderPromo->promotion_id;

                    PromotionRedemption::firstOrCreate(
                        ['idempotency_key' => $idempotencyKey],
                        [
                            'promotion_id'  => $orderPromo->promotion_id,
                            'order_id'      => $orderId,
                            'customer_id'   => $customerId,
                            'discount_laar' => $orderPromo->discount_laar,
                            'redeemed_at'   => now(),
                        ],
                    );

                    $orderPromo->update(['status' => 'consumed']);

                    $this->promotions->incrementRedemptionsCount($orderPromo->promotion_id);

                    Log::info('Promo redeemed', [
                        'promotion_id'  => $orderPromo->promotion_id,
                        'order_id'      => $orderId,
                        'discount_laar' => $orderPromo->discount_laar,
                    ]);
                }
            });
        } catch (\Throwable $e) {
            Log::error('ConsumePromoRedemptionsListener: failed', [
                'order_id' => $orderId,
                'error'    => $e->getMessage(),
            ]);
            // Do NOT re-throw — other listeners must still run
        }
    }
}
