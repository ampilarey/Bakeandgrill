<?php

declare(strict_types=1);

namespace App\Domains\Social\Drivers;

final readonly class PublishResult
{
    public function __construct(
        public string $providerPostId,
        public ?string $permalink = null,
        public ?string $providerContainerId = null,
    ) {}
}
