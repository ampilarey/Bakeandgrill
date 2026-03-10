<?php

declare(strict_types=1);

namespace App\Domains\Orders\Providers;

use App\Domains\Orders\Repositories\EloquentOrderRepository;
use App\Domains\Orders\Repositories\OrderRepositoryInterface;
use Illuminate\Support\ServiceProvider;

class OrderServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(OrderRepositoryInterface::class, EloquentOrderRepository::class);
    }
}
