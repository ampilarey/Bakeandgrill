<?php

declare(strict_types=1);

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Tests\Helpers\ModelHelpers;

abstract class TestCase extends BaseTestCase
{
    use ModelHelpers;
}
