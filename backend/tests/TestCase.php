<?php

declare(strict_types=1);

namespace Tests;

use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Tests\Helpers\ModelHelpers;

abstract class TestCase extends BaseTestCase
{
    use ModelHelpers;

    /**
     * Mirror production: deferred domain work runs after the HTTP response.
     */
    public function call($method, $uri, $parameters = [], $cookies = [], $files = [], $server = [], $content = null)
    {
        $response = parent::call($method, $uri, $parameters, $cookies, $files, $server, $content);
        DeferAfterResponse::flushTestingCallbacks();

        return $response;
    }
}
