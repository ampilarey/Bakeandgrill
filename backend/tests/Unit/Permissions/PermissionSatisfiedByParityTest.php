<?php

declare(strict_types=1);

namespace Tests\Unit\Permissions;

use App\Domains\Permissions\PermissionCatalog;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Pins PermissionCatalog::SATISFIED_BY to fixtures/permission_satisfied_by_parity.json
 * so admin PERM_ALIASES cannot drift one-sided (see admin navConfig parity test).
 */
class PermissionSatisfiedByParityTest extends TestCase
{
    private const FIXTURE_RELATIVE = 'fixtures/permission_satisfied_by_parity.json';

    private function fixturePath(): string
    {
        return dirname(__DIR__, 4).'/'.self::FIXTURE_RELATIVE;
    }

    /** @return array{repo_relative_path: string, satisfied_by: array<string, list<string>>} */
    private function fixture(): array
    {
        $path = $this->fixturePath();
        $this->assertFileExists($path, 'Shared permission parity fixture must exist at repo root');
        $decoded = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        $this->assertIsArray($decoded);
        $this->assertSame(self::FIXTURE_RELATIVE, $decoded['repo_relative_path'] ?? null);

        return $decoded;
    }

    #[Test]
    public function catalog_satisfied_by_matches_shared_fixture_exactly(): void
    {
        $fixture = $this->fixture();
        $fromCatalog = PermissionCatalog::SATISFIED_BY;
        $fromFixture = $fixture['satisfied_by'];

        $this->assertSame(
            $fromFixture,
            $fromCatalog,
            'PermissionCatalog::SATISFIED_BY diverged from fixtures/permission_satisfied_by_parity.json — update the catalog, the fixture, and admin PERM_ALIASES together.',
        );
    }
}
