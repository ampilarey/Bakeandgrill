<?php

declare(strict_types=1);

namespace App\Providers;

use App\Domains\Content\ContentResolver;
use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\Providers\DhiraaguSmsProvider;
use App\Domains\System\Services\QueueWorkerHeartbeat;
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
use Illuminate\Queue\Events\JobFailed;
use Illuminate\Queue\Events\JobProcessed;
use Illuminate\Support\Facades\Event;
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
        // A numbered throttle counts per route, not one count shared by every
        // route (UI audit, 2026-10-10; see the class). Bound in place of the
        // framework's class rather than aliased, so `throttle` keeps its name
        // and withoutMiddleware(ThrottleRequests::class) still switches it off.
        $this->app->bind(
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
            \App\Http\Middleware\ThrottleRequestsPerRoute::class,
        );
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
                ? 'user:' . $request->user()->id
                : (string) $request->ip();

            return Limit::perMinute(60)->by($key)->response(function () {
                return response()->json([
                    'message' => 'Too many shift open or close attempts. Wait about a minute and try again.',
                ], 429);
            });
        });

        // Public SMS/track links poll every ~10s. Key by token (not CGNAT IP) so
        // shared mobile networks and WhatsApp link-preview do not 429 the page.
        RateLimiter::for('public-order-track', function (Request $request) {
            $token = (string) $request->route('token');
            $key = $token !== ''
                ? 'track:' . $token
                : 'track-ip:' . $request->ip();

            return Limit::perMinute(120)->by($key)->response(function () {
                return response()->json([
                    'message' => 'Too many refreshes on this order link. Wait a few seconds and try again.',
                ], 429);
            });
        });

        // Customer sign-in (order app + website). Owner, 2026-10-06: a bare
        // "Too Many Attempts." on the phone step while testing. Maldivian
        // mobile networks put many customers behind one public IP, so a
        // per-IP bucket alone can lock out strangers at a busy hour. The
        // phone check is now budgeted per IP *and* number, with a generous
        // IP ceiling against number-scanning; every customer sign-in route
        // answers a 429 in words, with the wait.
        $waitMessage = static function (array $headers): \Illuminate\Http\JsonResponse {
            $seconds = max(1, (int) ($headers['Retry-After'] ?? 60));
            $wait = $seconds >= 90 ? ceil($seconds / 60) . ' minutes' : $seconds . ' seconds';
            $message = "Too many tries. Please wait {$wait} and try again.";

            return response()->json(['message' => $message, 'errors' => ['phone' => [$message]]], 429, $headers);
        };
        $phoneKey = static fn (Request $request): string => substr(preg_replace('/\D/', '', (string) $request->input('phone')) ?? '', -7);

        RateLimiter::for('customer-phone-check', function (Request $request) use ($waitMessage, $phoneKey) {
            return [
                Limit::perMinute(10)->by('phone-check:' . $request->ip() . '|' . $phoneKey($request))
                    ->response(fn ($request, array $headers) => $waitMessage($headers)),
                Limit::perMinute(120)->by('phone-check-ip:' . $request->ip())
                    ->response(fn ($request, array $headers) => $waitMessage($headers)),
            ];
        });
        // Same budgets as before (60 and 30 a minute per IP); only the reply changes.
        RateLimiter::for('customer-auth', fn (Request $request) => Limit::perMinute(60)
            ->by('customer-auth:' . $request->ip())
            ->response(fn ($request, array $headers) => $waitMessage($headers)));
        RateLimiter::for('customer-auth-strict', fn (Request $request) => Limit::perMinute(30)
            ->by('customer-auth-strict:' . $request->ip())
            ->response(fn ($request, array $headers) => $waitMessage($headers)));

        Order::observe(OrderObserver::class);
        // The buying list on Telegram follows each request (2026-10-07).
        \App\Models\PurchaseRequest::observe(\App\Observers\PurchaseRequestTelegramObserver::class);
        \App\Models\PurchaseRequestItem::updated(static fn (\App\Models\PurchaseRequestItem $item) => app(\App\Observers\PurchaseRequestTelegramObserver::class)->itemUpdated($item));
        // Cash taken out of a drawer reaches the owner on Telegram (2026-10-07).
        \App\Models\CashMovement::created(static function (\App\Models\CashMovement $m): void {
            $id = (int) $m->id;
            \App\Support\DeferAfterResponse::run(static fn () => app(\App\Domains\Telegram\Services\TelegramOwnerTools::class)->cashMoved($id), 'telegram-cash');
        });
        \App\Models\CashMovement::updated(static function (\App\Models\CashMovement $m): void {
            if ($m->wasChanged('voided_at') && $m->voided_at !== null) {
                $id = (int) $m->id;
                \App\Support\DeferAfterResponse::run(static fn () => app(\App\Domains\Telegram\Services\TelegramOwnerTools::class)->cashMoved($id, voided: true), 'telegram-cash');
            }
        });
        // A job on the production plan given to someone reaches them on Telegram (2026-10-07).
        \App\Models\ProductionPlanRecord::saved(static function (\App\Models\ProductionPlanRecord $record): void {
            if ($record->assigned_to !== null && ($record->wasRecentlyCreated || $record->wasChanged(['assigned_to', 'planned_qty', 'due_time']))) {
                \App\Domains\Telegram\Services\TelegramKitchenDesk::queueJobs((int) $record->assigned_to, \Illuminate\Support\Carbon::parse($record->plan_date)->toDateString());
            }
        });
        StaffSchedule::observe(StaffScheduleObserver::class);
        Item::observe(ItemObserver::class);
        // Every change to what a customer pays, from any screen (2026-10-01).
        Item::observe(\App\Observers\PriceAuditObserver::class);
        \App\Models\Variant::observe(\App\Observers\PriceAuditObserver::class);
        \App\Models\DailySpecial::observe(\App\Observers\PriceAuditObserver::class);
        \App\Models\Promotion::observe(\App\Observers\PriceAuditObserver::class);
        ItemPhoto::observe(ItemPhotoObserver::class);
        Category::observe(CategoryObserver::class);

        // Queue worker liveness — any finished job refreshes the heartbeat stamp.
        $recordWorkerBeat = static function (): void {
            try {
                app(QueueWorkerHeartbeat::class)->record();
            } catch (\Throwable) {
                // Never let heartbeat bookkeeping break job completion.
            }
        };
        Event::listen(JobProcessed::class, $recordWorkerBeat);
        Event::listen(JobFailed::class, $recordWorkerBeat);

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
