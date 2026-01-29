<?php

namespace App\Providers;

use App\Policies\CashPolicy;
use App\Policies\DiscountPolicy;
use App\Policies\PurchasePolicy;
use App\Policies\RefundPolicy;
use App\Policies\SmsPolicy;
use App\Policies\StockPolicy;
use App\Policies\VoidPolicy;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AuthServiceProvider extends ServiceProvider
{
    /**
     * Register any authentication / authorization services.
     */
    public function boot(): void
    {
        Gate::define('discount.apply', [DiscountPolicy::class, 'apply']);
        Gate::define('refund.process', [RefundPolicy::class, 'process']);
        Gate::define('order.void', [VoidPolicy::class, 'void']);
        Gate::define('stock.manage', [StockPolicy::class, 'manage']);
        Gate::define('cash.manage', [CashPolicy::class, 'manage']);
        Gate::define('purchase.manage', [PurchasePolicy::class, 'manage']);
        Gate::define('sms.send', [SmsPolicy::class, 'send']);
    }
}
