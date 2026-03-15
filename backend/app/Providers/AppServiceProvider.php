<?php

declare(strict_types=1);

namespace App\Providers;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\Providers\DhiraaguSmsProvider;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // SMS provider — swap this binding to switch providers (e.g. Twilio, Ooredoo)
        $this->app->bind(SmsProviderInterface::class, DhiraaguSmsProvider::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
