<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Providers;

use App\Domains\Loyalty\Repositories\CustomerRepositoryInterface;
use App\Domains\Loyalty\Repositories\EloquentCustomerRepository;
use Illuminate\Support\ServiceProvider;

class LoyaltyServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(CustomerRepositoryInterface::class, EloquentCustomerRepository::class);
    }
}
