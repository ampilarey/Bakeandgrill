<?php

declare(strict_types=1);

namespace App\Domains\Payments\Providers;

use App\Domains\Payments\Actions\SettleOrderPaymentAction;
use App\Domains\Payments\Repositories\EloquentPaymentRepository;
use App\Domains\Payments\Repositories\PaymentRepositoryInterface;
use App\Domains\Payments\Services\PaymentAllocationService;
use Illuminate\Support\ServiceProvider;

class PaymentServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(PaymentRepositoryInterface::class, EloquentPaymentRepository::class);
        $this->app->singleton(PaymentAllocationService::class);
        $this->app->singleton(SettleOrderPaymentAction::class);
    }
}
