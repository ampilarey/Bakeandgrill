<?php

declare(strict_types=1);

return [
    App\Providers\AppServiceProvider::class,
    App\Providers\AuthServiceProvider::class,
    App\Providers\Domains\DomainEventServiceProvider::class,

    // Domain service providers — each domain registers its own repository bindings
    App\Domains\Orders\Providers\OrderServiceProvider::class,
    App\Domains\Payments\Providers\PaymentServiceProvider::class,
    App\Domains\Loyalty\Providers\LoyaltyServiceProvider::class,
    App\Domains\Inventory\Providers\InventoryServiceProvider::class,
    App\Domains\Promotions\Providers\PromotionsServiceProvider::class,
    App\Domains\Reservations\Providers\ReservationServiceProvider::class,
];
