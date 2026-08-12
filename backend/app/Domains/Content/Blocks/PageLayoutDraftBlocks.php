<?php

declare(strict_types=1);

namespace App\Domains\Content\Blocks;

use App\Models\PageBlock;
use App\Models\PageLayoutDraft;

/**
 * Shared draft→serialized-blocks logic for staff page-layout drafts.
 * Used by PageBlockController (draft editing/publish) and
 * ContentPreviewController (merging a layout draft into a content preview
 * token) so both stay in sync with a single serialization format.
 */
final class PageLayoutDraftBlocks
{
    /**
     * @return list<array<string, mixed>>|null null when no draft exists for this user/app/page
     */
    public static function forUser(int $userId, string $app, string $page = PageBlock::PAGE_HOME): ?array
    {
        $draft = PageLayoutDraft::query()
            ->where('user_id', $userId)
            ->where('app', $app)
            ->where('page', $page)
            ->first();

        if (! $draft instanceof PageLayoutDraft) {
            return null;
        }

        $payload = is_array($draft->payload) ? $draft->payload : [];
        $blocks = $payload['blocks'] ?? [];

        return is_array($blocks) ? self::serialize($blocks) : [];
    }

    /**
     * @param  list<array<string, mixed>>  $blocks
     * @return list<array<string, mixed>>
     */
    public static function serialize(array $blocks): array
    {
        $out = [];
        foreach ($blocks as $row) {
            if (! is_array($row)) {
                continue;
            }
            $type = (string) ($row['block_type'] ?? '');
            $def = BlockTypeRegistry::get($type);
            $settings = is_array($row['settings'] ?? null) ? $row['settings'] : [];
            $settings = GenericBlockPresenter::sanitizeSettings($type, $settings);
            $media = GenericBlockPresenter::resolveMedia($type, $settings);

            $out[] = [
                'id' => (int) ($row['id'] ?? 0),
                'app' => (string) ($row['app'] ?? PageBlock::APP_WEBSITE),
                'page' => (string) ($row['page'] ?? PageBlock::PAGE_HOME),
                'block_type' => $type,
                'position' => (int) ($row['position'] ?? 0),
                'is_enabled' => (bool) ($row['is_enabled'] ?? true),
                'content_mode' => (string) ($row['content_mode'] ?? PageBlock::MODE_SHARED),
                'shared_content_id' => isset($row['shared_content_id']) ? (int) $row['shared_content_id'] : null,
                'shared_content_uuid' => isset($row['shared_content_uuid']) ? (string) $row['shared_content_uuid'] : null,
                'settings' => $settings,
                'media' => $media,
                'label' => $def?->label ?? $type,
                'description' => $def?->description ?? '',
                'removable' => $def?->removable ?? true,
                'non_removable_reason' => $def?->nonRemovableReason,
                'supports_shared_content' => $def?->supportsSharedContent ?? false,
                'allows_multiple' => $def?->allowsMultiple ?? false,
                'unknown' => $def === null,
                ...(
                    isset($row['share_source'])
                        ? ['share_source' => (string) $row['share_source']]
                        : []
                ),
                ...(
                    isset($row['clear_app_overrides'])
                        ? ['clear_app_overrides' => (bool) $row['clear_app_overrides']]
                        : []
                ),
            ];
        }

        usort($out, fn (array $a, array $b): int => ((int) $a['position']) <=> ((int) $b['position']));

        return array_values($out);
    }
}
