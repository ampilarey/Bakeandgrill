<?php

declare(strict_types=1);

namespace App\Domains\Promotions\Listeners;

use App\Domains\Orders\Events\OrderRefunded;
use App\Domains\Promotions\Repositories\PromotionRepositoryInterface;
use App\Models\Order;
use App\Models\Promotion;
use App\Models\PromotionRedemption;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * On a fully refunded order, release consumed promo redemptions so the
 * campaign / per-customer usage slot can be reused. Partial refunds leave
 * the redemption in place.
 */
class ReleasePromoRedemptionOnRefundListener
{
    public bool $afterCommit = true;

    public function __construct(private PromotionRepositoryInterface $promotions) {}

    public function handle(OrderRefunded $event): void
    {
        $order = Order::query()->find($event->data->orderId);
        if (!$order || $order->status !== 'refunded') {
            return;
        }

        try {
            DB::transaction(function () use ($order): void {
                $redemptions = PromotionRedemption::query()
                    ->where('order_id', $order->id)
                    ->where(function ($q) {
                        $q->where('status', 'active')->orWhereNull('status');
                    })
                    ->lockForUpdate()
                    ->get();

                foreach ($redemptions as $redemption) {
                    $promo = Promotion::query()
                        ->where('id', $redemption->promotion_id)
                        ->lockForUpdate()
                        ->first();

                    $redemption->update([
                        'status' => 'released',
                        'released_at' => now(),
                    ]);

                    if ($promo) {
                        $this->promotions->decrementRedemptionsCount($promo->id);
                        $this->promotions->decrementSpentLaar(
                            $promo->id,
                            (int) ($redemption->discount_laar ?? 0),
                        );
                    }

                    Log::info('Promo redemption released on full refund', [
                        'promotion_id' => $redemption->promotion_id,
                        'order_id' => $order->id,
                        'redemption_id' => $redemption->id,
                    ]);
                }
            });
        } catch (\Throwable $e) {
            Log::error('ReleasePromoRedemptionOnRefundListener: failed', [
                'order_id' => $event->data->orderId,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
