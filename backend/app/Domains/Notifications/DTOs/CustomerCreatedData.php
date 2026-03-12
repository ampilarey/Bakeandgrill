<?php

declare(strict_types=1);

namespace App\Domains\Notifications\DTOs;

readonly class CustomerCreatedData
{
    public function __construct(
        public int $customerId,
        public string $phone,
        public ?string $name,
    ) {}
}
