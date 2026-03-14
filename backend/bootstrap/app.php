<?php

declare(strict_types=1);

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'device.active'  => App\Http\Middleware\EnsureActiveDevice::class,
            'bml.signature'  => App\Http\Middleware\VerifyBmlSignature::class,
            'role'           => App\Http\Middleware\RequireRole::class,
            'customer.token' => App\Http\Middleware\EnsureCustomerToken::class,
            'staff.token'    => App\Http\Middleware\EnsureStaffToken::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->report(function (\Throwable $e): void {
            if (app()->bound('log')) {
                app('log')->error($e->getMessage(), [
                    'exception' => get_class($e),
                    'file'      => $e->getFile(),
                    'line'      => $e->getLine(),
                    'trace'     => $e->getTraceAsString(),
                ]);
            }
        });

        $exceptions->render(function (\Throwable $e, \Illuminate\Http\Request $request) {
            if ($request->expectsJson() || $request->is('api/*')) {
                $status = method_exists($e, 'getStatusCode') ? $e->getStatusCode() : 500;
                $message = $status < 500 ? $e->getMessage() : 'Server error. Please try again.';
                return response()->json(['message' => $message], $status);
            }
        });
    })->create();
