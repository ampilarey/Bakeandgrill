<?php

declare(strict_types=1);

namespace Tests\Unit\Content;

use App\Domains\Content\ContentRegistry;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Stage 2 / matrix row 8 (early): every non-deprecated registry key that targets an app
 * appears exactly once in that app's audited surface inventory.
 *
 * Inventory is built from renderers (Blade / Order App), not config `group` labels.
 * Source of truth for the listing: docs/content_surface_inventory.json
 * Human tables: docs/CONTENT_SURFACE_INVENTORY.md
 */
final class ContentSurfaceInventoryTest extends TestCase
{
    /**
     * @return array<string, array{0: string}>
     */
    public static function appsProvider(): array
    {
        return [
            'website' => ['website'],
            'order_app' => ['order_app'],
        ];
    }

    #[DataProvider('appsProvider')]
    public function test_every_non_deprecated_app_targeted_key_appears_exactly_once_in_inventory(string $app): void
    {
        $inventory = $this->loadInventory();
        $this->assertArrayHasKey($app, $inventory, "Inventory missing app [{$app}]");

        $keyIndex = $inventory[$app]['key_index'] ?? null;
        $this->assertIsArray($keyIndex, "Inventory [{$app}].key_index must be an object map");

        $fromPages = [];
        foreach ($inventory[$app]['pages'] ?? [] as $pageId => $page) {
            $this->assertIsArray($page, "Inventory page [{$app}/{$pageId}] must be an object");
            foreach ($page['keys'] ?? [] as $key) {
                $key = (string) $key;
                if (array_key_exists($key, $fromPages)) {
                    $this->fail(
                        "Key [{$key}] is listed more than once across [{$app}] inventory pages"
                        ." (also on page [{$fromPages[$key]}]; duplicate on [{$pageId}])"
                    );
                }
                $fromPages[$key] = (string) $pageId;
            }
        }

        $fromPagesKeys = array_keys($fromPages);
        $indexKeys = array_keys($keyIndex);
        sort($fromPagesKeys);
        sort($indexKeys);
        $this->assertSame(
            $fromPagesKeys,
            $indexKeys,
            "Inventory [{$app}].key_index must list the same keys as pages[*].keys (unique set)",
        );

        $expected = [];
        foreach (ContentRegistry::hubBlocks() as $key => $_block) {
            $key = (string) $key;
            if (ContentRegistry::targetsApp($key, $app)) {
                $expected[] = $key;
            }
        }
        sort($expected);

        $actual = array_keys($keyIndex);
        sort($actual);

        $missing = array_values(array_diff($expected, $actual));
        $extra = array_values(array_diff($actual, $expected));

        $this->assertSame(
            [],
            $missing,
            "Registry keys targeting [{$app}] missing from inventory (would be lost in Stage 4 regroup): "
            .implode(', ', $missing),
        );
        $this->assertSame(
            [],
            $extra,
            "Inventory [{$app}] lists keys not in non-deprecated registry for that app: "
            .implode(', ', $extra),
        );
        $this->assertCount(
            count($expected),
            $keyIndex,
            "Expected exactly ".count($expected)." unique [{$app}] inventory keys",
        );

        foreach ($keyIndex as $key => $meta) {
            $this->assertIsArray($meta, "key_index entry [{$app}/{$key}] must be an object");
            $this->assertArrayHasKey('page', $meta);
            $this->assertSame(
                $fromPages[$key] ?? null,
                $meta['page'],
                "key_index [{$app}/{$key}].page must match the page that lists the key",
            );
        }
    }

    public function test_inventory_file_exists_and_declares_both_apps(): void
    {
        $path = $this->inventoryPath();
        $this->assertFileExists($path, 'Stage 2 inventory JSON is required at docs/content_surface_inventory.json');

        $inventory = $this->loadInventory();
        $this->assertArrayHasKey('website', $inventory);
        $this->assertArrayHasKey('order_app', $inventory);
        $this->assertArrayHasKey('structural_surfaces', $inventory);
        $this->assertGreaterThanOrEqual(14, count($inventory['structural_surfaces']));
    }

    /**
     * @return array<string, mixed>
     */
    private function loadInventory(): array
    {
        $raw = file_get_contents($this->inventoryPath());
        $this->assertNotFalse($raw, 'Could not read inventory JSON');
        $decoded = json_decode($raw, true);
        $this->assertIsArray($decoded, 'Inventory JSON must decode to an object');

        return $decoded;
    }

    private function inventoryPath(): string
    {
        return base_path('../docs/content_surface_inventory.json');
    }
}
