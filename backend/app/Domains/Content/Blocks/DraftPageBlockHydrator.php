<?php

declare(strict_types=1);

namespace App\Domains\Content\Blocks;

use App\Models\PageBlock;
use Illuminate\Support\Collection;

/**
 * Hydrate staff preview page_blocks overlays into PageBlock models
 * (Website Blade chrome + home walker).
 */
final class DraftPageBlockHydrator
{
    /**
     * @param  mixed  $draftOverrides  content.draft_overrides binding
     * @return Collection<int, PageBlock>|null  null = use live repository
     */
    public static function forAppPage(mixed $draftOverrides, string $app, string $page = PageBlock::PAGE_HOME): ?Collection
    {
        if (! is_array($draftOverrides)) {
            return null;
        }

        $rows = $draftOverrides['page_blocks'][$app][$page] ?? null;
        if (! is_array($rows)) {
            return null;
        }

        return collect($rows)->map(function ($row) {
            $row = is_array($row) ? $row : [];
            $block = new PageBlock;
            $row['shared_content_id'] = null;
            $block->forceFill($row);
            $block->exists = false;

            return $block;
        })->values();
    }
}
