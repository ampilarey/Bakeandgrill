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

    /**
     * Blocks enabled for one customer surface (app × device × slot), ordered for that device.
     *
     * @return Collection<int, PageBlock>
     */
    public static function forSurface(
        string $app,
        string $device,
        string $slot,
        ?Collection $blocks = null,
        bool $enabledOnly = true,
    ): Collection {
        $blocks ??= self::forPage($app);

        return $blocks
            ->filter(function (PageBlock $block) use ($device, $slot, $enabledOnly) {
                if ($enabledOnly && ! $block->is_enabled) {
                    return false;
                }
                $settings = $block->resolvedSettings();
                if (! BlockDeviceSettings::visibleOnDevice($settings, $device)) {
                    return false;
                }

                return BlockDeviceSettings::placementOnDevice($settings, $device) === $slot;
            })
            ->sortBy(function (PageBlock $block) use ($device) {
                $settings = $block->resolvedSettings();

                return [
                    BlockDeviceSettings::orderOnDevice($settings, $device, (int) $block->position),
                    (int) $block->id,
                ];
            })
            ->values();
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
