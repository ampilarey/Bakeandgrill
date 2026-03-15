<?php

declare(strict_types=1);

namespace App\Providers;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\Providers\DhiraaguSmsProvider;
use App\Models\Order;
use App\Observers\OrderObserver;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(SmsProviderInterface::class, DhiraaguSmsProvider::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Order::observe(OrderObserver::class);
    }
}
