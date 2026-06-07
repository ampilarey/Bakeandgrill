<?php

declare(strict_types=1);

namespace App\Domains\Credit\Providers;

use App\Domains\Credit\Services\CreditEligibilityService;
use App\Domains\Credit\Services\CreditLedgerService;
use App\Domains\Credit\Services\CustomerCreditService as DomainCustomerCreditService;
use Illuminate\Support\ServiceProvider;

class CreditServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(CreditEligibilityService::class);
        $this->app->singleton(CreditLedgerService::class);
        $this->app->singleton(\App\Domains\Customers\Services\CustomerCreditService::class);
        $this->app->alias(
            \App\Domains\Customers\Services\CustomerCreditService::class,
            DomainCustomerCreditService::class,
        );
    }
}
