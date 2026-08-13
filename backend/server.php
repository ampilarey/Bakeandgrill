<?php

/**
 * Local `php artisan serve` router (preferred over framework server.php when present).
 *
 * PHP's built-in server treats public/admin/index.html as the script for any
 * /admin/* URI (directory index), which sets:
 *   SCRIPT_NAME=/admin/index.html, PATH_INFO=/content/website
 * Laravel then matches path /content/website and 404s. Same for order/kds/pos/driver.
 *
 * For SPA client routes we front-controller through public/index.php and reset
 * SCRIPT_* / PATH_INFO so the Request path stays the real REQUEST_URI path.
 */

$publicPath = getcwd();

$uri = urldecode(
    parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? ''
);

$spaRoots = ['/admin', '/order', '/kds', '/pos', '/driver'];

$isSpaAssetOrIndex = false;
$isSpaClientRoute = false;

foreach ($spaRoots as $root) {
    if ($uri !== $root && ! str_starts_with($uri, $root.'/')) {
        continue;
    }

    $file = $publicPath.$uri;

    // Real files under the SPA folder (assets, theme-init.js, …)
    if (is_file($file)) {
        $isSpaAssetOrIndex = true;
        break;
    }

    // Directory URL → let the built-in server serve index.html
    if (($uri === $root || $uri === $root.'/') && is_file($publicPath.$root.'/index.html')) {
        $isSpaAssetOrIndex = true;
        break;
    }

    $isSpaClientRoute = true;
    break;
}

if ($isSpaAssetOrIndex) {
    return false;
}

if (! $isSpaClientRoute && $uri !== '/' && file_exists($publicPath.$uri)) {
    return false;
}

if ($isSpaClientRoute) {
    $_SERVER['SCRIPT_NAME'] = '/index.php';
    $_SERVER['SCRIPT_FILENAME'] = $publicPath.'/index.php';
    $_SERVER['PHP_SELF'] = '/index.php';
    unset($_SERVER['PATH_INFO'], $_SERVER['ORIG_PATH_INFO']);
}

$formattedDateTime = date('D M j H:i:s Y');
$requestMethod = $_SERVER['REQUEST_METHOD'];
$remoteAddress = ($_SERVER['REMOTE_ADDR'] ?? '').':'.($_SERVER['REMOTE_PORT'] ?? '');
file_put_contents('php://stdout', "[$formattedDateTime] $remoteAddress [$requestMethod] URI: $uri\n");

require_once $publicPath.'/index.php';
