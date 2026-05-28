<?php

declare(strict_types=1);

namespace App\Services;

use App\Domains\Loyalty\Services\LoyaltyLedgerService;
use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Domains\Promotions\Services\PromotionEvaluator;
use App\Models\Customer;
use App\Models\GiftCard;
use App\Models\Order;
use App\Models\OrderPromotion;
use Illuminate\Support\Facades\DB;

/**
 * Applies staged POS rewards during offline sync (promo → loyalty → gift card).
 */
class OfflineOrderRewardsService
{
    public function __construct(
        private PromotionEvaluator $promoEvaluator,
        private LoyaltyLedgerService $loyalty,
        private OrderTotalsCalculator $calculator,
    ) {}

    /**
     * @param array<string, mixed> $rewards
     */
    public function apply(Order $order, array $rewards): Order
    {
        $order = $order->fresh(['items.item']);

        if ($promo = trim((string) ($rewards['promo_code'] ?? ''))) {
            $this->applyPromo($order, $promo);
            $order = $order->fresh(['items.item']);
        }

        $points = (int) ($rewards['loyalty_points'] ?? 0);
        if ($points > 0) {
            $this->applyLoyalty($order, $points);
            $order = $order->fresh(['items.item']);
        }

        if ($gift = trim((string) ($rewards['gift_card_code'] ?? ''))) {
            $this->applyGiftCard($order, $gift);
            $order = $order->fresh(['items.item']);
        }

        return $order->fresh();
    }

    private function applyPromo(Order $order, string $code): void
    {
        if (in_array($order->status, ['paid', 'completed', 'cancelled', 'partial'], true)) {
            throw new \RuntimeException('Cannot apply promo to this order.');
        }

        $result = $this->promoEvaluator->evaluate($code, $order, $order->customer_id);

        if (!$result['valid']) {
            throw new \RuntimeException($result['message'] ?? 'Promo code invalid.');
        }

        $promotion = $result['promotion'];
        $idempotencyKey = 'order-promo:' . $order->id . ':' . $promotion->id;

        DB::transaction(function () use ($order, $promotion, $result, $idempotencyKey): void {
            $order = Order::lockForUpdate()->findOrFail($order->id);

            if (in_array($order->status, ['paid', 'completed', 'cancelled', 'partial'], true)) {
                throw new \RuntimeException('Order is no longer modifiable.');
            }

            $existing = OrderPromotion::where('order_id', $order->id)
                ->whereNotIn('status', ['released'])
                ->first();

            if ($existing && !$promotion->stackable) {
                $existing->update(['status' => 'released']);
            }

            OrderPromotion::firstOrCreate(
                ['idempotency_key' => $idempotencyKey],
                [
                    'order_id' => $order->id,
                    'promotion_id' => $promotion->id,
                    'discount_laar' => $result['discount_laar'],
                    'status' => 'draft',
                ],
            );

            $totalPromoDiscount = OrderPromotion::where('order_id', $order->id)
                ->where('status', 'draft')
                ->sum('discount_laar');

            $order->update(['promo_discount_laar' => $totalPromoDiscount]);
            $this->calculator->recalculateAndPersist($order);
        });
    }

    private function applyLoyalty(Order $order, int $points): void
    {
        if (!$order->customer_id) {
            throw new \RuntimeException('Attach a customer before redeeming loyalty points.');
        }

        /** @var Customer $customer */
        $customer = Customer::findOrFail($order->customer_id);

        $hold = $this->loyalty->createOrRefreshHold($customer, $order, $points);
        $order->update(['loyalty_discount_laar' => $hold->discount_laar]);
        $this->calculator->recalculateAndPersist($order->fresh());
    }

    private function applyGiftCard(Order $order, string $code): void
    {
        if (!in_array($order->status, ['payment_pending', 'pending'], true)) {
            throw new \RuntimeException('Cannot apply gift card to this order.');
        }

        DB::transaction(function () use ($order, $code): void {
            $order = Order::lockForUpdate()->findOrFail($order->id);

            $card = GiftCard::where('code', strtoupper($code))
                ->where('status', 'active')
                ->lockForUpdate()
                ->first();

            if (!$card) {
                throw new \RuntimeException('Invalid or unavailable gift card.');
            }
            if ($card->expires_at && $card->expires_at->isPast()) {
                $card->update(['status' => 'expired']);
                throw new \RuntimeException('This gift card has expired.');
            }

            $maxDiscount = (int) round((float) $card->current_balance * 100);
            $currentDueLaar = (int) ($order->total_laar ?? round((float) $order->total * 100));
            $discountLaar = min($maxDiscount, max(0, $currentDueLaar));

            $order->update([
                'gift_card_code' => $card->code,
                'gift_card_discount_laar' => $discountLaar,
            ]);

            $this->calculator->recalculateAndPersist($order->fresh());
        });
    }
}
