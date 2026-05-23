<?php

declare(strict_types=1);

namespace App\Support;

use RuntimeException;

final class BmlSignatureGuard
{
    public static function assertProductionEnforcement(string $environment, bool $enforceSignature): void
    {
        if ($environment === 'production' && !$enforceSignature) {
            throw new RuntimeException(
                'BML_ENFORCE_SIGNATURE must be true in production. '
                . 'Live payments require webhook signature verification.',
            );
        }
    }
}
