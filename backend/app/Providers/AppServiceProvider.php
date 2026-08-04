<?php

declare(strict_types=1);

namespace App\Providers;

use App\Domains\Content\ContentResolver;
use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\Providers\DhiraaguSmsProvider;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemPhoto;
use App\Models\Order;
use App\Models\StaffSchedule;
use App\Observers\CategoryObserver;
use App\Observers\ItemObserver;
use App\Observers\ItemPhotoObserver;
use App\Observers\OrderObserver;
use App\Observers\StaffScheduleObserver;
use App\Support\BmlSignatureGuard;
use App\Support\DocumentBrandView;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Facades\View;
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
        if (!$this->app->isProduction()) {
            Model::preventLazyLoading();
            Model::preventSilentlyDiscardingAttributes();
        }

        // IP-based safety net only — real lockouts are per phone/email in StaffAuthController.
        // Keep this lenient so shared office / CGNAT IPs do not show bare "Too Many Attempts."
        RateLimiter::for('staff-login', function (Request $request) {
            return Limit::perMinute(60)->by((string) $request->ip())->response(function () {
                return response()->json([
                    'message' => 'Too many sign-in requests from this network. Wait about a minute and try again.',
                ], 429);
            });
        });

        // Shift open/close/force-close — authenticated + permission-gated already.
        // Keep a ceiling against buggy retry loops, but allow real till use
        // (mistyped opening float, shared office IP) without locking cashiers out.
        RateLimiter::for('pos-shift', function (Request $request) {
            $key = $request->user()?->id
                ? 'user:'.$request->user()->id
                : (string) $request->ip();

            return Limit::perMinute(60)->by($key)->response(function () {
                return response()->json([
                    'message' => 'Too many shift open or close attempts. Wait about a minute and try again.',
                ], 429);
            });
        });

        Order::observe(OrderObserver::class);
        StaffSchedule::observe(StaffScheduleObserver::class);
        Item::observe(ItemObserver::class);
        ItemPhoto::observe(ItemPhotoObserver::class);
        Category::observe(CategoryObserver::class);

        View::composer([
            'layouts.pdf',
            'invoices.pdf',
            'partials.document-masthead',
            'partials.document-print-footer',
        ], function ($view): void {
            $view->with(DocumentBrandView::variables());
        });

        View::composer([
            'layout',
            'home',
            'contact',
            'hours',
            'privacy',
            'terms',
            'refund',
            'maintenance',
            'prayer-times',
            'order-gateway',
        ], function ($view): void {
            $view->with('content', ContentResolver::for('website'));
        });

        // Force HTTPS scheme in production so generated URLs and redirects are always secure.
        if ($this->app->environment('production')) {
            URL::forceScheme('https');
            if (BmlSignatureGuard::shouldRunAtBoot('production', $this->app->runningInConsole())) {
                BmlSignatureGuard::assertProductionEnforcement('production', (bool) config('bml.enforce_signature', true));
            }
        }
    }
}
