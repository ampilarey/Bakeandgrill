<?php

declare(strict_types=1);

return [
    App\Domains\Credit\Providers\CreditServiceProvider::class,
    App\Domains\Deposits\Providers\DepositsServiceProvider::class,
    App\Domains\Inventory\Providers\InventoryServiceProvider::class,
    App\Domains\Loyalty\Providers\LoyaltyServiceProvider::class,
    App\Domains\Orders\Providers\OrderServiceProvider::class,
    App\Domains\Payments\Providers\PaymentServiceProvider::class,
    App\Domains\Permissions\Providers\PermissionsServiceProvider::class,
    App\Domains\Printing\Providers\PrintingServiceProvider::class,
    App\Domains\Promotions\Providers\PromotionsServiceProvider::class,
    App\Domains\Reservations\Providers\ReservationServiceProvider::class,
    App\Domains\Shifts\Providers\ShiftsServiceProvider::class,
    App\Providers\AppServiceProvider::class,
    App\Providers\AuthServiceProvider::class,
    App\Providers\Domains\DomainEventServiceProvider::class,
    App\Providers\HorizonServiceProvider::class,
];
