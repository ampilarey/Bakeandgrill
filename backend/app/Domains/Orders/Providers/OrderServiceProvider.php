<?php

declare(strict_types=1);

namespace App\Domains\Orders\Providers;

use App\Domains\Orders\Actions\HoldOrderAction;
use App\Domains\Orders\Actions\ResumeOrderAction;
use App\Domains\Orders\Repositories\EloquentOrderRepository;
use App\Domains\Orders\Repositories\OrderRepositoryInterface;
use Illuminate\Support\ServiceProvider;

class OrderServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(OrderRepositoryInterface::class, EloquentOrderRepository::class);
        $this->app->singleton(\App\Services\OrderCreationService::class);
        $this->app->alias(
            \App\Services\OrderCreationService::class,
            \App\Domains\Orders\Services\OrderCreationService::class,
        );
        $this->app->singleton(HoldOrderAction::class);
        $this->app->singleton(ResumeOrderAction::class);
    }
}
