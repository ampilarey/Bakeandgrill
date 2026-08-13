<?php

declare(strict_types=1);

namespace App\Domains\Content;

use App\Domains\Content\Blocks\BlockTypeRegistry;
use App\Domains\Content\Blocks\PageBlockRepository;
use App\Domains\Content\Blocks\SurfaceCatalog;
use App\Domains\Settings\OpsOwnedContent;
use App\Models\PageBlock;
use App\Models\SiteSetting;

/**
 * Admin-only integrity audit for Content & Branding.
 * Does not mutate data — reports duplicates, orphans, ops ownership leaks, and needs-review rows.
 */
final class ContentIntegrityReport
{
    /**
     * @return array{
     *   generated_at: string,
     *   surfaces: list<array{id: string, count: int}>,
     *   issues: list<array{severity: string, code: string, message: string, meta?: array<string, mixed>}>,
     *   needs_review: list<array{kind: string, identifier: string, detail: string}>,
     *   summary: array{issue_count: int, needs_review_count: int, surface_count: int}
     * }
     */
    public static function generate(): array
    {
        $issues = [];
        $needsReview = [];
        $surfaces = [];

        foreach (SurfaceCatalog::all() as $surface) {
            $blocks = PageBlockRepository::forSurface(
                $surface['app'],
                $surface['device'],
                $surface['slot'],
            );
            $count = $blocks->count();
            $surfaces[] = ['id' => $surface['id'], 'count' => $count];

            $byTypePos = [];
            foreach ($blocks as $block) {
                /** @var PageBlock $block */
                if (! BlockTypeRegistry::isKnown($block->block_type)) {
                    $needsReview[] = [
                        'kind' => 'orphan_block_type',
                        'identifier' => (string) $block->id,
                        'detail' => "page_block #{$block->id} type [{$block->block_type}] has no registry entry on {$surface['id']}",
                    ];
                    $issues[] = [
                        'severity' => 'warning',
                        'code' => 'unknown_block_type',
                        'message' => "Unknown block type [{$block->block_type}] on {$surface['id']}",
                        'meta' => ['block_id' => $block->id, 'surface' => $surface['id']],
                    ];
                }

                $key = $block->block_type.'@'.$block->position;
                $byTypePos[$key] = ($byTypePos[$key] ?? 0) + 1;
            }

            foreach ($byTypePos as $key => $n) {
                if ($n > 1 && ! str_contains($key, 'rich_text') && ! str_contains($key, 'image')) {
                    $issues[] = [
                        'severity' => 'warning',
                        'code' => 'duplicate_position',
                        'message' => "Duplicate active component identity on {$surface['id']}: {$key} × {$n}",
                        'meta' => ['surface' => $surface['id'], 'key' => $key, 'count' => $n],
                    ];
                }
            }
        }

        // Ops-owned keys still stored at website/order_app scope (legacy, must not win).
        foreach (array_merge(array_keys(OpsOwnedContent::DELIVERY_OPS), OpsOwnedContent::BUSINESS_DETAILS_KEYS) as $key) {
            foreach (['website', 'order_app'] as $scope) {
                $val = SiteSetting::getScoped($key, $scope, 'en');
                if ($val !== null && $val !== '') {
                    $needsReview[] = [
                        'kind' => 'legacy_ops_override',
                        'identifier' => "{$scope}.{$key}",
                        'detail' => "Leftover {$scope} row for ops-owned [{$key}] — ignored by ContentResolver but should be cleaned after audit.",
                    ];
                    $issues[] = [
                        'severity' => 'info',
                        'code' => 'legacy_ops_scoped_row',
                        'message' => "Legacy {$scope} copy of ops-owned key [{$key}] still present",
                        'meta' => ['key' => $key, 'scope' => $scope],
                    ];
                }
            }
        }

        // Shareable flag leftovers on dual-app presentation keys (customer content must not be shared).
        foreach (ContentRegistry::hubBlocks() as $key => $def) {
            if (! is_array($def) || ! empty($def['deprecated'])) {
                continue;
            }
            $key = (string) $key;
            if ($key === '' || OpsOwnedContent::isWriteForbidden($key)) {
                continue;
            }
            if (! empty($def['shareable'])) {
                $apps = $def['apps'] ?? [];
                if (in_array('website', $apps, true) && in_array('order_app', $apps, true)) {
                    $needsReview[] = [
                        'kind' => 'shareable_flag',
                        'identifier' => $key,
                        'detail' => "Registry key [{$key}] is still marked shareable — customer content must be independent per app.",
                    ];
                }
            }
        }

        // Cross-app shared_content_id should not exist (MODE_SHARED retired).
        $sharedMode = PageBlock::query()
            ->where('content_mode', 'shared')
            ->orWhereNotNull('shared_content_id')
            ->count();
        if ($sharedMode > 0) {
            $issues[] = [
                'severity' => 'error',
                'code' => 'shared_page_block_mode',
                'message' => "{$sharedMode} page_block row(s) still use shared content mode or shared_content_id",
            ];
        }

        return [
            'generated_at' => now()->toIso8601String(),
            'surfaces' => $surfaces,
            'issues' => $issues,
            'needs_review' => $needsReview,
            'summary' => [
                'issue_count' => count($issues),
                'needs_review_count' => count($needsReview),
                'surface_count' => count($surfaces),
            ],
        ];
    }
}
