<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Facades\App;

/**
 * Run work after the HTTP response is sent to the client.
 *
 * POS charge waits on createOrder + addPayments API round-trips. Domain
 * events (kitchen print, SMS, inventory) must not extend those requests.
 */
final class DeferAfterResponse
{
    public static function run(callable $callback): void
    {
        if (\function_exists('defer')) {
            defer($callback);

            return;
        }

        App::terminating(static function () use ($callback): void {
            $callback();
        });
    }
}
