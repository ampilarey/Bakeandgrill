<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Providers;

use App\Domains\Loyalty\Repositories\CustomerRepositoryInterface;
use App\Domains\Loyalty\Repositories\EloquentCustomerRepository;
use App\Domains\Loyalty\Repositories\EloquentLoyaltyAccountRepository;
use App\Domains\Loyalty\Repositories\EloquentLoyaltyHoldRepository;
use App\Domains\Loyalty\Repositories\EloquentLoyaltyLedgerRepository;
use App\Domains\Loyalty\Repositories\LoyaltyAccountRepositoryInterface;
use App\Domains\Loyalty\Repositories\LoyaltyHoldRepositoryInterface;
use App\Domains\Loyalty\Repositories\LoyaltyLedgerRepositoryInterface;
use Illuminate\Support\ServiceProvider;

class LoyaltyServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(CustomerRepositoryInterface::class, EloquentCustomerRepository::class);
        $this->app->bind(LoyaltyAccountRepositoryInterface::class, EloquentLoyaltyAccountRepository::class);
        $this->app->bind(LoyaltyHoldRepositoryInterface::class, EloquentLoyaltyHoldRepository::class);
        $this->app->bind(LoyaltyLedgerRepositoryInterface::class, EloquentLoyaltyLedgerRepository::class);
    }
}
