<?php

declare(strict_types=1);

namespace App\Domains\Deposits\Providers;

use App\Domains\Deposits\Services\CustomerDepositService;
use App\Domains\Deposits\Services\DepositEligibilityService;
use App\Domains\Deposits\Services\DepositLedgerService;
use Illuminate\Support\ServiceProvider;

class DepositsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(DepositEligibilityService::class);
        $this->app->singleton(DepositLedgerService::class);
        $this->app->singleton(CustomerDepositService::class);
    }
}
