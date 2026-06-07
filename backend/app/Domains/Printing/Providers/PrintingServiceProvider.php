<?php

declare(strict_types=1);

namespace App\Domains\Printing\Providers;

use Illuminate\Support\ServiceProvider;

class PrintingServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(\App\Services\PrintJobService::class);
        $this->app->alias(
            \App\Services\PrintJobService::class,
            \App\Domains\Printing\Services\PrintJobService::class,
        );
    }
}
