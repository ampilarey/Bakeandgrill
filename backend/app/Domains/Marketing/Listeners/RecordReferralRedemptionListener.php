<?php

declare(strict_types=1);

namespace App\Domains\Marketing\Listeners;

use App\Domains\Loyalty\Services\LoyaltyLedgerService;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Referral;
use App\Models\ReferralCode;
use App\Services\LoyaltySettingsService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * On payment, record referral usage once per order and credit the referrer.
 *
 * Synchronous after commit. Does NOT mark redemption recorded until the
 * referrer bonus succeeds (or there is no bonus to pay) — so a failed credit
 * can retry instead of permanently skipping the reward.
 */
class RecordReferralRedemptionListener
{
    public bool $afterCommit = true;

    public function handle(OrderPaid $event): void
    {
        $orderId = $event->data->orderId;

        try {
            DB::transaction(function () use ($orderId): void {
                $locked = Order::where('id', $orderId)->lockForUpdate()->first();
                if (!$locked || empty($locked->referral_code) || (int) ($locked->referral_discount_laar ?? 0) <= 0) {
                    return;
                }
                if ($locked->referral_redemption_recorded) {
                    return;
                }

                $code = ReferralCode::where('code', $locked->referral_code)->lockForUpdate()->first();
                if (!$code || !$locked->customer_id) {
                    $locked->update(['referral_redemption_recorded' => true]);

                    return;
                }

                if ((int) $code->customer_id === (int) $locked->customer_id) {
                    $locked->update(['referral_redemption_recorded' => true]);

                    return;
                }

                $existing = Referral::where('referral_code_id', $code->id)
                    ->where('referee_customer_id', $locked->customer_id)
                    ->first();

                if (!$existing) {
                    $code->increment('uses_count');
                    $existing = Referral::create([
                        'referral_code_id' => $code->id,
                        'referee_customer_id' => (int) $locked->customer_id,
                        'order_id' => $locked->id,
                        'reward_paid' => false,
                    ]);
                }

                if (!$existing->reward_paid) {
                    $this->creditReferrerBonus($code, $locked, $existing);
                }

                $locked->update(['referral_redemption_recorded' => true]);
            });
        } catch (\Throwable $e) {
            Log::error('RecordReferralRedemptionListener: failed', [
                'order_id' => $orderId,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    private function creditReferrerBonus(ReferralCode $code, Order $order, Referral $referral): void
    {
        $referrer = Customer::find($code->customer_id);
        if (!$referrer) {
            return;
        }

        $redeemRate = app(LoyaltySettingsService::class)->redeemRatePointsPerMvr();
        $rewardMvr = (float) ($code->referrer_reward_mvr ?? config('loyalty.referral.referrer_reward_mvr', 10.00));
        $rewardPoints = (int) round($rewardMvr * $redeemRate);

        if ($rewardPoints <= 0) {
            $referral->update(['reward_paid' => true]);

            return;
        }

        $idempotencyKey = 'referral:reward:' . $code->id . ':' . $order->id;
        app(LoyaltyLedgerService::class)->creditBonus(
            $referrer,
            $rewardPoints,
            'Referral reward — friend used code ' . $code->code,
            $idempotencyKey,
        );

        $referral->update(['reward_paid' => true]);
    }
}
