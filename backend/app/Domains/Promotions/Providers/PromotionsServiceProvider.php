<?php

declare(strict_types=1);

namespace App\Domains\Promotions\Providers;

use App\Domains\Promotions\Repositories\EloquentPromotionRedemptionRepository;
use App\Domains\Promotions\Repositories\EloquentPromotionRepository;
use App\Domains\Promotions\Repositories\PromotionRedemptionRepositoryInterface;
use App\Domains\Promotions\Repositories\PromotionRepositoryInterface;
use Illuminate\Support\ServiceProvider;

class PromotionsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(PromotionRepositoryInterface::class, EloquentPromotionRepository::class);
        $this->app->bind(PromotionRedemptionRepositoryInterface::class, EloquentPromotionRedemptionRepository::class);
    }
}
