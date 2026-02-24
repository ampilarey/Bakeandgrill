<?php

declare(strict_types=1);

namespace Tests\Contract;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\SnapshotHelper;
use Tests\TestCase;

/**
 * Base class for API contract/snapshot tests.
 *
 * These tests exist to catch regressions in response shapes during refactoring.
 * They do NOT test business logic — that's the job of Feature tests.
 */
abstract class ContractTestCase extends TestCase
{
    use RefreshDatabase;
    use SnapshotHelper;
}
