<?php

declare(strict_types=1);

namespace Tests\Unit\Support;

use App\Support\LaariConverter;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Pins POS Math.round(n*100) ↔ LaariConverter::toLaar against the shared
 * fixtures/mvr_to_laari_parity.json table. Do not rewrite either side here —
 * a real divergence needs a product decision.
 */
class MvrLaariParityTest extends TestCase
{
    private const FIXTURE_RELATIVE = 'fixtures/mvr_to_laari_parity.json';

    /** @return array{repo_relative_path: string, pairs: list<array{input: float|int, expected_laari: int}>, known_divergences: list<array<string, mixed>>} */
    private function fixturePath(): string
    {
        // backend/tests/Unit/Support → repo root is four levels up
        return dirname(__DIR__, 4).'/'.self::FIXTURE_RELATIVE;
    }

    private function fixture(): array
    {
        $path = $this->fixturePath();
        $this->assertFileExists($path, 'Shared money parity fixture must exist at repo root');
        $decoded = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        $this->assertIsArray($decoded);
        $this->assertSame(self::FIXTURE_RELATIVE, $decoded['repo_relative_path'] ?? null);

        return $decoded;
    }

    #[Test]
    public function shared_fixture_path_is_the_repo_root_file(): void
    {
        $path = $this->fixturePath();
        $this->assertStringEndsWith('/'.self::FIXTURE_RELATIVE, str_replace('\\', '/', $path));
        $this->assertFileExists($path);
    }

    #[Test]
    public function php_laari_converter_matches_shared_parity_table(): void
    {
        $fixture = $this->fixture();
        $this->assertNotEmpty($fixture['pairs']);

        foreach ($fixture['pairs'] as $pair) {
            $input = $pair['input'];
            $expected = (int) $pair['expected_laari'];
            $actual = LaariConverter::toLaar($input);
            $this->assertSame(
                $expected,
                $actual,
                "LaariConverter::toLaar({$input}) diverged from shared fixture (got {$actual}, expected {$expected})",
            );
        }
    }

    #[Test]
    public function known_divergence_on_1_005_is_documented_not_papered_over(): void
    {
        $fixture = $this->fixture();
        $rows = $fixture['known_divergences'] ?? [];
        $this->assertNotEmpty($rows, '1.005 divergence must remain documented until a product decision');

        $row = null;
        foreach ($rows as $candidate) {
            if ((float) $candidate['input'] === 1.005) {
                $row = $candidate;
                break;
            }
        }
        $this->assertNotNull($row, 'Fixture must document the 1.005 case');

        $actual = LaariConverter::toLaar(1.005);
        $this->assertSame(100, (int) $row['js_laari']);
        $this->assertSame(101, (int) $row['php_bcmath_laari']);
        $this->assertSame(100, (int) $row['php_float_fallback_laari']);

        // Do not pick a winner — assert the live PHP path matches whichever
        // branch LaariConverter is on, and that it still disagrees with JS
        // when bcmath is present (the production Docker image installs it).
        if (extension_loaded('bcmath')) {
            $this->assertSame(101, $actual);
            $this->assertNotSame((int) $row['js_laari'], $actual);
        } else {
            $this->assertSame(100, $actual);
        }
    }
}
