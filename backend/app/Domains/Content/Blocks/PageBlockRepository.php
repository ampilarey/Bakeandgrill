<?php

declare(strict_types=1);

namespace App\Domains\Content\Blocks;

use App\Models\PageBlock;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

/**
 * Single-query load of a page's blocks (website home is server-rendered).
 */
final class PageBlockRepository
{
    private const CACHE_TTL = 60;

    /**
     * @return Collection<int, PageBlock>
     */
    public static function forPage(string $app, string $page = PageBlock::PAGE_HOME, bool $useCache = true): Collection
    {
        $loader = static function () use ($app, $page) {
            return PageBlock::query()
                ->where('app', $app)
                ->where('page', $page)
                ->orderBy('position')
                ->orderBy('id')
                ->get();
        };

        if (! $useCache) {
            return $loader();
        }

        $key = self::cacheKey($app, $page);
        /** @var list<array<string, mixed>> $rows */
        $rows = Cache::remember($key, self::CACHE_TTL, function () use ($loader) {
            return $loader()->map(fn (PageBlock $b) => $b->toArray())->all();
        });

        return collect($rows)->map(function (array $row) {
            $block = new PageBlock;
            $block->forceFill($row);
            $block->exists = true;

            return $block;
        });
    }

    public static function bust(string $app, string $page = PageBlock::PAGE_HOME): void
    {
        Cache::forget(self::cacheKey($app, $page));
    }

    public static function bustAll(): void
    {
        self::bust(PageBlock::APP_WEBSITE);
        self::bust(PageBlock::APP_ORDER);
    }

    private static function cacheKey(string $app, string $page): string
    {
        return "page_blocks.{$app}.{$page}";
    }
}
