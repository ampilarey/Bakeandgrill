<?php

declare(strict_types=1);

namespace App\Domains\Permissions\Providers;

use App\Domains\Permissions\Services\PermissionService;
use Illuminate\Support\ServiceProvider;

class PermissionsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(\App\Services\PermissionService::class);
        $this->app->alias(\App\Services\PermissionService::class, PermissionService::class);
    }
}
