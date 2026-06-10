<?php

declare(strict_types=1);

namespace App\Providers;

use App\Domains\Permissions\Services\PermissionService;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;
use Laravel\Horizon\Horizon;
use Laravel\Horizon\HorizonApplicationServiceProvider;

class HorizonServiceProvider extends HorizonApplicationServiceProvider
{
    public function boot(): void
    {
        parent::boot();

        Horizon::auth(function (Request $request): bool {
            if ($this->app->environment('local')) {
                return true;
            }

            $user = $request->user() ?? Auth::guard('sanctum')->user();

            if (!$user instanceof User || !$user->is_active) {
                return false;
            }

            $token = $user->currentAccessToken();
            if ($token !== null && !$user->tokenCan('staff')) {
                return false;
            }

            return app(PermissionService::class)->hasPermission($user, 'website.manage');
        });
    }

    /**
     * Register the Horizon gate (used by Horizon::check() helpers).
     */
    protected function gate(): void
    {
        Gate::define('viewHorizon', function (?User $user = null): bool {
            if ($this->app->environment('local')) {
                return true;
            }

            if (!$user instanceof User || !$user->is_active) {
                return false;
            }

            $token = $user->currentAccessToken();
            if ($token !== null && !$user->tokenCan('staff')) {
                return false;
            }

            return app(PermissionService::class)->hasPermission($user, 'website.manage');
        });
    }
}
