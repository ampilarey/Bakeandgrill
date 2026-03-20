<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Illuminate\Cookie\Middleware\EncryptCookies as Middleware;

class EncryptCookies extends Middleware
{
    /**
     * Cookies that should NOT be encrypted.
     *
     * _cauth and _cauth_name are short-lived handoff cookies read by the
     * React order app via document.cookie — they must be plain text.
     *
     * @var array<int, string>
     */
    protected $except = [
        '_cauth',
        '_cauth_name',
    ];
}
