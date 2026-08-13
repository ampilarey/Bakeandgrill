<?php

declare(strict_types=1);

namespace App\Domains\Content\Blocks;

use App\Models\PageBlock;
use Illuminate\Support\Facades\DB;

/**
 * Convert today's hardcoded home arrangements into page_blocks.
 * Idempotent: re-running replaces home rows for each app with the same snapshot.
 * Reversible: down() of the data migration deletes page_blocks for home.
 */
final class HomeLayoutMigrator
{
    /**
     * @return array{website: int, order_app: int}
     */
    public static function migrate(): array
    {
        return DB::transaction(function () {
            $website = self::writeApp(PageBlock::APP_WEBSITE, HomeLayoutSnapshot::legacyWebsite());
            $order = self::writeApp(PageBlock::APP_ORDER, HomeLayoutSnapshot::legacyOrderApp());
            CustomerSurfaceMigrator::migrate();
            PageBlockRepository::bustAll();

            return ['website' => $website, 'order_app' => $order];
        });
    }

    public static function reverse(): void
    {
        PageBlock::query()
            ->where('page', PageBlock::PAGE_HOME)
            ->whereIn('app', [PageBlock::APP_WEBSITE, PageBlock::APP_ORDER])
            ->delete();
        PageBlockRepository::bustAll();
    }

    /**
     * @param  list<array{type: string, enabled: bool}>  $snapshot
     */
    private static function writeApp(string $app, array $snapshot): int
    {
        PageBlock::query()
            ->where('app', $app)
            ->where('page', PageBlock::PAGE_HOME)
            ->delete();

        $position = 0;
        foreach ($snapshot as $row) {
            $type = $row['type'];
            $def = BlockTypeRegistry::get($type);
            if ($def === null || ! $def->allowsApp($app)) {
                continue;
            }

            PageBlock::create([
                'app' => $app,
                'page' => PageBlock::PAGE_HOME,
                'block_type' => $type,
                'position' => $position,
                'is_enabled' => (bool) $row['enabled'],
                'content_mode' => PageBlock::MODE_OWN,
                'settings' => [],
            ]);
            $position++;
        }

        return $position;
    }
}
