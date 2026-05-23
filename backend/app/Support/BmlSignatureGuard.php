<?php

declare(strict_types=1);

namespace App\Support;

use RuntimeException;

final class BmlSignatureGuard
{
    /** Composer post-install hooks — must not require full payment env. */
    private const SKIP_CONSOLE_COMMANDS = [
        'package:discover',
        'clear-compiled',
    ];

    public static function assertProductionEnforcement(string $environment, bool $enforceSignature): void
    {
        if ($environment === 'production' && !$enforceSignature) {
            throw new RuntimeException(
                'BML_ENFORCE_SIGNATURE must be true in production. '
                . 'Live payments require webhook signature verification.',
            );
        }
    }

    /**
     * Run the guard during HTTP and meaningful artisan commands (migrate, serve, etc.),
     * but skip composer maintenance hooks that boot the app before .env is fully wired.
     */
    public static function shouldRunAtBoot(string $environment, bool $runningInConsole): bool
    {
        if ($environment !== 'production') {
            return false;
        }

        if (!$runningInConsole) {
            return true;
        }

        $command = $_SERVER['argv'][1] ?? '';

        return !in_array($command, self::SKIP_CONSOLE_COMMANDS, true);
    }
}
