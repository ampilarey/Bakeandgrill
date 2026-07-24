<?php

declare(strict_types=1);

namespace App\Domains\Orders\DTOs;

final class DiscountDecision
{
    public function __construct(
        public readonly int $discountLaar,
        public readonly ?string $reason,
        public readonly ?string $reasonNote,
        public readonly ?int $approvedByUserId,
    ) {}
}
