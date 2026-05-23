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
    public static function run(callable $callback, string $context = 'deferred'): void
    {
        $wrapped = static function () use ($callback, $context): void {
            static::flushResponse();
            static::invoke($callback, $context);
        };

        if (\function_exists('defer')) {
            defer($wrapped);

            return;
        }

        App::terminating($wrapped);
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
