<?php

declare(strict_types=1);

namespace App\Domains\Notifications\DTOs;

final readonly class SmsMessage
{
    public function __construct(
        public string $to,
        public string $message,
        public string $type,              // otp | promotion | campaign | transactional
        public ?int $customerId = null,
        public ?int $campaignId = null,
        public ?string $referenceType = null,
        public ?string $referenceId = null,
        public ?string $idempotencyKey = null,
    ) {}
}
