<?php

declare(strict_types=1);

namespace App\Domains\Shifts\Providers;

use App\Domains\Shifts\Services\ShiftAccessService;
use Illuminate\Support\ServiceProvider;

class ShiftsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(\App\Services\ShiftAccessService::class);
        $this->app->alias(\App\Services\ShiftAccessService::class, ShiftAccessService::class);
    }
}
