<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Run work after the HTTP response is sent to the client.
 *
 * POS charge waits on createOrder + addPayments API round-trips. Domain
 * events (kitchen print, SMS, inventory) must not extend those requests
 * or fail the JSON response if Redis/queue side-effects hiccup.
 */
final class DeferAfterResponse
{
    /** @var list<array{0: callable, 1: string}> */
    private static array $testingCallbacks = [];

    /**
     * @param bool $always run even when the response is an error. Laravel's
     *                     defer() skips its callbacks on any 4xx/5xx response; a copy of an
     *                     SMS that has already gone must not be dropped because the request
     *                     that triggered it was refused (owner, 2026-10-07: a new till's 403
     *                     "waiting for approval" dropped the alert's Telegram copy).
     */
    public static function run(callable $callback, string $context = 'deferred', bool $always = false): void
    {
        // PHPUnit keeps one PHP process for the whole suite; native defer() would not
        // run until shutdown. Queue callbacks so contract tests can flush explicitly
        // without running deferred work during the HTTP request (redis regression).
        if (App::environment('testing')) {
            self::$testingCallbacks[] = [$callback, $context];

            return;
        }

        $wrapped = static function () use ($callback, $context): void {
            self::flushResponse();
            self::invoke($callback, $context);
        };

        if (\function_exists('defer')) {
            $deferred = defer($wrapped);
            if ($always) {
                $deferred->always();
            }

            return;
        }

        App::terminating($wrapped);
    }

    /** Run deferred callbacks queued during feature/contract tests. */
    public static function flushTestingCallbacks(): void
    {
        while ($pending = array_shift(self::$testingCallbacks)) {
            self::invoke($pending[0], $pending[1]);
        }
    }

    private static function flushResponse(): void
    {
        if (\function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        }
    }

    private static function invoke(callable $callback, string $context): void
    {
        try {
            $callback();
        } catch (Throwable $e) {
            Log::error('DeferAfterResponse callback failed', [
                'context' => $context,
                'error' => $e->getMessage(),
                'exception' => $e,
            ]);
        }
    }
}
