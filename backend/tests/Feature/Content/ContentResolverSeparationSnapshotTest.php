<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\ContentResolverSnapshot;
use Tests\TestCase;

/**
 * Stage 1 safety net for separating website / order_app content from shared fallback.
 *
 * Captures ContentResolver output for all non-deprecated keys × apps × locales
 * after migrations. Stages 2–3 must leave every answer unchanged.
 *
 * Regenerate fixture (only when intentionally updating the baseline):
 *   GENERATE_CONTENT_RESOLVER_SNAPSHOT=1 php artisan test --filter=ContentResolverSeparationSnapshotTest
 */
class ContentResolverSeparationSnapshotTest extends TestCase
{
    use RefreshDatabase;

    public function test_resolver_snapshot_matches_committed_fixture_for_all_680_combinations(): void
    {
        $keys = ContentResolverSnapshot::nonDeprecatedKeys();
        $this->assertCount(176, $keys, 'Expected 176 non-deprecated content.php keys');

        $actual = ContentResolverSnapshot::capture();
        $this->assertSame(
            ContentResolverSnapshot::EXPECTED_COMBINATIONS,
            $actual['meta']['combinations'],
            'Expected 176 keys × 2 apps × 2 locales = 704 combinations',
        );

        $path = ContentResolverSnapshot::fixturePath();

        if (env('GENERATE_CONTENT_RESOLVER_SNAPSHOT') === '1') {
            $dir = dirname($path);
            if (! is_dir($dir)) {
                mkdir($dir, 0777, true);
            }
            file_put_contents(
                $path,
                json_encode($actual, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n",
            );
            $this->assertFileExists($path);

            return;
        }

        $this->assertFileExists(
            $path,
            'Missing snapshot fixture. Generate with GENERATE_CONTENT_RESOLVER_SNAPSHOT=1',
        );

        $expected = json_decode((string) file_get_contents($path), true);
        $this->assertIsArray($expected);
        $this->assertSame(
            ContentResolverSnapshot::EXPECTED_COMBINATIONS,
            $expected['meta']['combinations'] ?? null,
        );

        $diffs = ContentResolverSnapshot::diff($expected, $actual);
        $this->assertSame(
            [],
            $diffs,
            "ContentResolver snapshot drifted (".count($diffs)." differences).\n"
            .implode("\n", array_slice($diffs, 0, 40)),
        );
    }
}
