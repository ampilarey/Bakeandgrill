<?php

/**
 * Local PHP built-in server router for Playwright `--project=local`.
 *
 * Two quirks of PHP's built-in server when `public/admin/index.html` exists:
 * 1. `/admin/content` arrives as SCRIPT_NAME=/admin/index.html + PATH_INFO=/content
 *    so Laravel 404s the public site instead of serving the SPA shell.
 * 2. Static files under `/admin/assets/*` can be swept into the same PATH_INFO
 *    rewrite unless we short-circuit on real files first.
 *
 * Usage (cwd must be backend/public):
 *   php -S 127.0.0.1:8000 ../../e2e/helpers/adminSpaRouter.php
 */

declare(strict_types=1);

$publicPath = getcwd();
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/');

// Serve real files/directories under public/ as-is (admin assets, order assets, …).
if ($uri !== '/' && file_exists($publicPath . $uri) && !is_dir($publicPath . $uri)) {
    return false;
}

if (
    str_starts_with($uri, '/admin/')
    && $uri !== '/admin/'
    && isset($_SERVER['PATH_INFO'])
) {
    $_SERVER['SCRIPT_NAME'] = '/index.php';
    $_SERVER['PHP_SELF'] = '/index.php';
    unset($_SERVER['PATH_INFO']);
}

require dirname(__DIR__, 2) . '/backend/vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php';
