<?php

declare(strict_types=1);

namespace App\Domains\Marketing\Listeners;

use App\Domains\Loyalty\Services\LoyaltyLedgerService;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Referral;
use App\Models\ReferralCode;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * On payment, record referral usage once per order and bump the code's uses_count
 * only for the referee's first completed redemption for that code.
 */
class RecordReferralRedemptionListener
{
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
                    Referral::create([
                        'referral_code_id' => $code->id,
                        'referee_customer_id' => (int) $locked->customer_id,
                        'order_id' => $locked->id,
                        'reward_paid' => false,
                    ]);

                    // Credit referrer with loyalty points equivalent to their reward MVR
                    $referrer = Customer::find($code->customer_id);
                    if ($referrer) {
                        $redeemRate = (int) config('app.loyalty_redeem_rate', 100);
                        $rewardMvr = (float) ($code->referrer_reward_mvr ?? config('loyalty.referral.referrer_reward_mvr', 10.00));
                        $rewardPoints = (int) round($rewardMvr * $redeemRate);

                        if ($rewardPoints > 0) {
                            try {
                                $idempotencyKey = 'referral:reward:' . $code->id . ':' . $locked->id;
                                app(LoyaltyLedgerService::class)->creditBonus(
                                    $referrer,
                                    $rewardPoints,
                                    'Referral reward — friend used code ' . $code->code,
                                    $idempotencyKey,
                                );
                                Referral::where('referral_code_id', $code->id)
                                    ->where('referee_customer_id', $locked->customer_id)
                                    ->update(['reward_paid' => true]);
                            } catch (\Throwable $e) {
                                Log::error('RecordReferralRedemptionListener: failed to credit referrer bonus', [
                                    'referral_code_id' => $code->id,
                                    'referrer_id' => $referrer->id,
                                    'error' => $e->getMessage(),
                                ]);
                            }
                        }
                    }
                }

                $locked->update(['referral_redemption_recorded' => true]);
            });
        } catch (\Throwable $e) {
            Log::error('RecordReferralRedemptionListener: failed', [
                'order_id' => $orderId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
