<?php

declare(strict_types=1);

namespace App\Domains\Media\Services;

use App\Models\Category;
use App\Models\Item;
use App\Models\ItemPhoto;
use App\Models\Media;
use App\Models\SignageCampaign;
use App\Models\SignagePlaylist;
use App\Models\SiteSetting;
use App\Support\MediaFileCleaner;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Find every place a media asset URL/path is referenced.
 *
 * @phpstan-type UsageRow array{type: string, label: string, id: int|string|null, field?: string}
 */
final class MediaUsageResolver
{
    /**
     * @return list<UsageRow>
     */
    public function for(Media $media): array
    {
        $candidates = $this->candidateUrls($media);
        if ($candidates === []) {
            return [];
        }

        $out = [];

        $itemCols = array_values(array_filter([
            'image_url',
            Schema::hasColumn('items', 'image_original_url') ? 'image_original_url' : null,
            Schema::hasColumn('items', 'thumb_url') ? 'thumb_url' : null,
        ]));
        if ($itemCols !== []) {
            $items = Item::query()
                ->where(function ($q) use ($itemCols, $candidates) {
                    foreach ($itemCols as $col) {
                        $q->orWhereIn($col, $candidates);
                    }
                })
                ->get(['id', 'name', ...$itemCols]);
            foreach ($items as $item) {
                foreach ($itemCols as $col) {
                    if (in_array((string) $item->{$col}, $candidates, true)) {
                        $out[] = [
                            'type' => 'item',
                            'label' => 'Menu item: ' . ($item->name ?: '#' . $item->id),
                            'id' => (int) $item->id,
                            'field' => $col,
                        ];
                    }
                }
            }
        }

        $photoCols = array_values(array_filter([
            'url',
            Schema::hasColumn('item_photos', 'original_url') ? 'original_url' : null,
            Schema::hasColumn('item_photos', 'thumb_url') ? 'thumb_url' : null,
            Schema::hasColumn('item_photos', 'poster_url') ? 'poster_url' : null,
        ]));
        if ($photoCols !== [] && Schema::hasTable('item_photos')) {
            $photos = ItemPhoto::query()
                ->where(function ($q) use ($photoCols, $candidates) {
                    foreach ($photoCols as $col) {
                        $q->orWhereIn($col, $candidates);
                    }
                })
                ->get(['id', 'item_id', 'alt_text', ...$photoCols]);
            foreach ($photos as $photo) {
                foreach ($photoCols as $col) {
                    if (in_array((string) $photo->{$col}, $candidates, true)) {
                        $out[] = [
                            'type' => 'item_photo',
                            'label' => 'Gallery photo #' . $photo->id . ' (item ' . $photo->item_id . ')',
                            'id' => (int) $photo->id,
                            'field' => $col,
                        ];
                    }
                }
            }
        }

        $catCols = array_values(array_filter([
            'image_url',
            Schema::hasColumn('categories', 'image_original_url') ? 'image_original_url' : null,
            Schema::hasColumn('categories', 'thumb_url') ? 'thumb_url' : null,
        ]));
        if ($catCols !== []) {
            $cats = Category::query()
                ->where(function ($q) use ($catCols, $candidates) {
                    foreach ($catCols as $col) {
                        $q->orWhereIn($col, $candidates);
                    }
                })
                ->get(['id', 'name', ...$catCols]);
            foreach ($cats as $cat) {
                foreach ($catCols as $col) {
                    if (in_array((string) $cat->{$col}, $candidates, true)) {
                        $out[] = [
                            'type' => 'category',
                            'label' => 'Category: ' . ($cat->name ?: '#' . $cat->id),
                            'id' => (int) $cat->id,
                            'field' => $col,
                        ];
                    }
                }
            }
        }

        $brandKeys = ['logo', 'logo_dark', 'favicon', 'og_image'];
        $settings = SiteSetting::query()
            ->where(function ($q) use ($candidates, $brandKeys) {
                $q->whereIn('value', $candidates);
                foreach ($candidates as $url) {
                    $q->orWhere('value', 'like', '%' . $this->escapeLike($url) . '%');
                }
                $q->orWhereIn('key', $brandKeys);
            })
            ->get(['id', 'key', 'value', 'group', 'label']);

        foreach ($settings as $setting) {
            $value = (string) $setting->value;
            $matched = in_array($value, $candidates, true);
            if (!$matched) {
                foreach ($candidates as $url) {
                    if ($url !== '' && str_contains($value, $url)) {
                        $matched = true;
                        break;
                    }
                }
            }
            if ($matched) {
                $out[] = [
                    'type' => 'site_setting',
                    'label' => 'Setting: ' . ($setting->label ?: $setting->key),
                    'id' => (int) $setting->id,
                    'field' => (string) $setting->key,
                ];
            }
        }

        foreach ($this->signageUsages($candidates) as $row) {
            $out[] = $row;
        }

        foreach ($this->contentJsonUsages($media, $candidates) as $row) {
            $out[] = $row;
        }

        return $this->uniqueRows($out);
    }

    /**
     * @param  list<string>  $candidates
     * @return list<UsageRow>
     */
    private function signageUsages(array $candidates): array
    {
        $out = [];
        if (Schema::hasTable('signage_playlists')) {
            foreach (SignagePlaylist::query()->get(['id', 'name', 'slides', 'theme']) as $playlist) {
                $blob = json_encode([$playlist->slides, $playlist->theme], JSON_UNESCAPED_UNICODE) ?: '';
                foreach ($candidates as $url) {
                    if ($url !== '' && str_contains($blob, $url)) {
                        $out[] = [
                            'type' => 'signage_playlist',
                            'label' => 'Signage playlist: ' . ($playlist->name ?: '#' . $playlist->id),
                            'id' => (int) $playlist->id,
                            'field' => 'slides',
                        ];
                        break;
                    }
                }
            }
        }
        if (Schema::hasTable('signage_campaigns')) {
            foreach (SignageCampaign::query()->get(['id', 'name', 'slides']) as $campaign) {
                $blob = json_encode($campaign->slides, JSON_UNESCAPED_UNICODE) ?: '';
                foreach ($candidates as $url) {
                    if ($url !== '' && str_contains($blob, $url)) {
                        $out[] = [
                            'type' => 'signage_campaign',
                            'label' => 'Signage campaign: ' . ($campaign->name ?: '#' . $campaign->id),
                            'id' => (int) $campaign->id,
                            'field' => 'slides',
                        ];
                        break;
                    }
                }
            }
        }

        return $out;
    }

    /**
     * @param  list<string>  $candidates
     * @return list<UsageRow>
     */
    private function contentJsonUsages(Media $media, array $candidates): array
    {
        $out = [];
        $tables = [
            'page_blocks' => ['field' => 'settings', 'type' => 'page_block', 'label' => 'Page block'],
            'page_block_shared_contents' => ['field' => 'settings', 'type' => 'page_block_shared_content', 'label' => 'Shared page block content'],
            'page_layout_drafts' => ['field' => 'payload', 'type' => 'page_layout_draft', 'label' => 'Page layout draft'],
            'content_drafts' => ['field' => 'value', 'type' => 'content_draft', 'label' => 'Content draft'],
            'content_revisions' => ['field' => 'value', 'type' => 'content_revision', 'label' => 'Content revision'],
        ];

        foreach ($tables as $table => $meta) {
            $field = $meta['field'];
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, $field)) {
                continue;
            }

            foreach (DB::table($table)->get(['id', $field]) as $row) {
                $value = $row->{$field} ?? null;
                if (! $this->blobReferencesMedia($value, $media, $candidates)) {
                    continue;
                }

                $out[] = [
                    'type' => $meta['type'],
                    'label' => $meta['label'] . ' #' . $row->id,
                    'id' => (int) $row->id,
                    'field' => $field,
                ];
            }
        }

        return $out;
    }

    /**
     * @param  list<string>  $candidates
     */
    private function blobReferencesMedia(mixed $value, Media $media, array $candidates): bool
    {
        if ($value === null || $value === '') {
            return false;
        }

        if (is_string($value)) {
            foreach ($candidates as $url) {
                if ($url !== '' && str_contains($value, $url)) {
                    return true;
                }
            }

            $decoded = json_decode($value, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                return false;
            }

            return $this->arrayReferencesMedia($decoded, $media, $candidates);
        }

        if (is_array($value)) {
            return $this->arrayReferencesMedia($value, $media, $candidates);
        }

        return false;
    }

    /**
     * @param  list<string>  $candidates
     */
    private function arrayReferencesMedia(mixed $value, Media $media, array $candidates, ?string $key = null): bool
    {
        if (is_array($value)) {
            foreach ($value as $childKey => $child) {
                if ($this->arrayReferencesMedia($child, $media, $candidates, is_string($childKey) ? $childKey : null)) {
                    return true;
                }
            }

            return false;
        }

        if ($key === 'media_id' && is_numeric($value) && (int) $value === (int) $media->id) {
            return true;
        }

        if (is_scalar($value)) {
            $string = (string) $value;
            foreach ($candidates as $url) {
                if ($url !== '' && str_contains($string, $url)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Rewrite every stored reference from $fromUrl(s) to $toUrl.
     *
     * @return int Number of record fields updated
     */
    public function rewriteReferences(Media $media, string $fromUrl, string $toUrl): int
    {
        if ($fromUrl === '' || $toUrl === '' || $fromUrl === $toUrl) {
            return 0;
        }

        $fromUrls = array_values(array_unique(array_filter([
            $fromUrl,
            $this->normalizeStorageUrl($fromUrl),
            $this->pathOnly($fromUrl),
        ])));
        $updated = 0;

        $itemCols = array_values(array_filter([
            'image_url',
            Schema::hasColumn('items', 'image_original_url') ? 'image_original_url' : null,
            Schema::hasColumn('items', 'thumb_url') ? 'thumb_url' : null,
        ]));
        foreach (Item::query()->where(function ($q) use ($itemCols, $fromUrls) {
            foreach ($itemCols as $col) {
                $q->orWhereIn($col, $fromUrls);
            }
        })->get() as $item) {
            $dirty = false;
            foreach ($itemCols as $col) {
                if (in_array((string) $item->{$col}, $fromUrls, true)) {
                    $item->{$col} = $toUrl;
                    $dirty = true;
                    $updated++;
                }
            }
            if ($dirty) {
                $item->save();
            }
        }

        $photoCols = array_values(array_filter([
            'url',
            Schema::hasColumn('item_photos', 'original_url') ? 'original_url' : null,
            Schema::hasColumn('item_photos', 'thumb_url') ? 'thumb_url' : null,
            Schema::hasColumn('item_photos', 'poster_url') ? 'poster_url' : null,
        ]));
        if (Schema::hasTable('item_photos')) {
            foreach (ItemPhoto::query()->where(function ($q) use ($photoCols, $fromUrls) {
                foreach ($photoCols as $col) {
                    $q->orWhereIn($col, $fromUrls);
                }
            })->get() as $photo) {
                $dirty = false;
                foreach ($photoCols as $col) {
                    if (in_array((string) $photo->{$col}, $fromUrls, true)) {
                        $photo->{$col} = $toUrl;
                        $dirty = true;
                        $updated++;
                    }
                }
                if ($dirty) {
                    $photo->save();
                }
            }
        }

        $catCols = array_values(array_filter([
            'image_url',
            Schema::hasColumn('categories', 'image_original_url') ? 'image_original_url' : null,
            Schema::hasColumn('categories', 'thumb_url') ? 'thumb_url' : null,
        ]));
        foreach (Category::query()->where(function ($q) use ($catCols, $fromUrls) {
            foreach ($catCols as $col) {
                $q->orWhereIn($col, $fromUrls);
            }
        })->get() as $cat) {
            $dirty = false;
            foreach ($catCols as $col) {
                if (in_array((string) $cat->{$col}, $fromUrls, true)) {
                    $cat->{$col} = $toUrl;
                    $dirty = true;
                    $updated++;
                }
            }
            if ($dirty) {
                $cat->save();
            }
        }

        foreach (SiteSetting::query()->get(['id', 'key', 'value']) as $setting) {
            $value = (string) $setting->value;
            $new = $value;
            foreach ($fromUrls as $from) {
                if ($from !== '' && str_contains($new, $from)) {
                    $new = str_replace($from, $toUrl, $new);
                }
            }
            if ($new !== $value) {
                $setting->value = $new;
                $setting->save();
                $updated++;
            }
        }

        return $updated;
    }

    /** @return list<string> */
    private function candidateUrls(Media $media): array
    {
        $url = (string) $media->url;
        $path = (string) $media->path;
        $list = array_filter([
            $url,
            $this->normalizeStorageUrl($url),
            $path !== '' ? '/storage/' . ltrim($path, '/') : null,
            $media->thumb_url,
            $media->original_url,
        ]);

        return array_values(array_unique(array_map('strval', $list)));
    }

    private function normalizeStorageUrl(string $url): string
    {
        $path = MediaFileCleaner::storagePathFromUrl($url);
        if ($path === null) {
            return $url;
        }

        return '/storage/' . ltrim($path, '/');
    }

    private function pathOnly(string $url): ?string
    {
        return MediaFileCleaner::storagePathFromUrl($url);
    }

    private function escapeLike(string $value): string
    {
        return str_replace(['%', '_'], ['\\%', '\\_'], $value);
    }

    /**
     * @param  list<UsageRow>  $rows
     * @return list<UsageRow>
     */
    private function uniqueRows(array $rows): array
    {
        $seen = [];
        $out = [];
        foreach ($rows as $row) {
            $key = ($row['type'] ?? '') . ':' . ($row['id'] ?? '') . ':' . ($row['field'] ?? '');
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $out[] = $row;
        }

        return $out;
    }
}
