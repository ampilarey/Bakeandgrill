<?php

declare(strict_types=1);

namespace App\Providers;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\Providers\DhiraaguSmsProvider;
use App\Models\Order;
use App\Models\StaffSchedule;
use App\Observers\OrderObserver;
use App\Observers\StaffScheduleObserver;
use App\Support\BmlSignatureGuard;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(SmsProviderInterface::class, DhiraaguSmsProvider::class);
        $this->app->singleton(\App\Services\PermissionService::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Order::observe(OrderObserver::class);
        StaffSchedule::observe(StaffScheduleObserver::class);

        // Force HTTPS scheme in production so generated URLs and redirects are always secure.
        if ($this->app->environment('production')) {
            URL::forceScheme('https');
            if (BmlSignatureGuard::shouldRunAtBoot('production', $this->app->runningInConsole())) {
                BmlSignatureGuard::assertProductionEnforcement('production', (bool) config('bml.enforce_signature', true));
            }
        }
    }
}
