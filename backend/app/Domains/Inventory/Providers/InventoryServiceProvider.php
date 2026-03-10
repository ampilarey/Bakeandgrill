<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Providers;

use App\Domains\Inventory\Repositories\EloquentItemRepository;
use App\Domains\Inventory\Repositories\ItemRepositoryInterface;
use Illuminate\Support\ServiceProvider;

class InventoryServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(ItemRepositoryInterface::class, EloquentItemRepository::class);
    }
}
