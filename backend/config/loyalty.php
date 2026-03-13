<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Referral Reward Values (MVR)
    |--------------------------------------------------------------------------
    | referrer_reward_mvr  — credit added to the referrer's wallet when
    |                        their referee places a first order.
    | referee_discount_mvr — discount applied to the referee's first order.
    |
    | Override per-environment via .env:
    |   REFERRAL_REFERRER_REWARD=10.00
    |   REFERRAL_REFEREE_DISCOUNT=5.00
    */
    'referral' => [
        'referrer_reward_mvr'  => (float) env('REFERRAL_REFERRER_REWARD', 10.00),
        'referee_discount_mvr' => (float) env('REFERRAL_REFEREE_DISCOUNT', 5.00),
    ],
];
