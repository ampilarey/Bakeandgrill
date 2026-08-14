<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Content\ContentRegistry;
use App\Domains\Content\ContentWriter;
use App\Domains\Media\Services\MediaEditor;
use App\Domains\Media\Services\MediaLibraryService;
use App\Domains\Media\Services\MediaUsageResolver;
use App\Http\Controllers\Controller;
use App\Models\Media;
use App\Models\SiteSetting;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MediaLibraryController extends Controller
{
    public function __construct(
        private readonly MediaLibraryService $library,
        private readonly MediaUsageResolver $usage,
        private readonly MediaEditor $editor,
        private readonly AuditLogService $audit,
        private readonly ContentWriter $contentWriter,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => 'nullable|string|in:image,video,audio,document',
            'source' => 'nullable|string|max:32',
            'q' => 'nullable|string|max:100',
            'tag' => 'nullable|string|max:50',
            'collection' => 'nullable|string|max:100',
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);

        $query = Media::query()->with('collections')->orderByDesc('id');

        if (!empty($validated['type'])) {
            $query->ofType($validated['type']);
        }
        if (!empty($validated['source'])) {
            $query->where('source', $validated['source']);
        }
        if (!empty($validated['q'])) {
            $query->search($validated['q']);
        }
        if (!empty($validated['tag'])) {
            $tag = $validated['tag'];
            $query->where('tags', 'like', '%' . str_replace(['%', '_'], ['\\%', '\\_'], $tag) . '%');
        }
        if (!empty($validated['collection'])) {
            $slugOrId = $validated['collection'];
            $query->whereHas('collections', function ($q) use ($slugOrId) {
                if (ctype_digit((string) $slugOrId)) {
                    $q->where('media_collections.id', (int) $slugOrId);
                } else {
                    $q->where('media_collections.slug', $slugOrId);
                }
            });
        }

        $perPage = (int) ($validated['per_page'] ?? 25);
        $page = $query->paginate($perPage);

        $items = collect($page->items())->map(function (Media $m) {
            $usage = $this->usage->for($m);

            return array_merge($m->toArray(), [
                'usage_count' => count($usage),
            ]);
        });

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'files' => 'required|array|min:1|max:20',
            'files.*' => 'required|file|max:51200',
            'title' => 'nullable|string|max:200',
            'alt_text' => 'nullable|string|max:300',
            'collection_ids' => 'nullable|array',
            'collection_ids.*' => 'integer|exists:media_collections,id',
        ]);

        $results = [];
        foreach ($request->file('files', []) as $file) {
            $results[] = $this->library->storeUpload(
                $file,
                $request->user(),
                $validated['collection_ids'] ?? [],
                $validated['title'] ?? null,
                $validated['alt_text'] ?? null,
            );
        }

        $this->audit->log(
            'media.uploaded',
            'Media',
            null,
            [],
            ['count' => count($results)],
            [],
            $request,
        );

        return response()->json(['data' => $results], 201);
    }

    public function update(Request $request, Media $media): JsonResponse
    {
        $validated = $request->validate([
            'title' => 'nullable|string|max:200',
            'alt_text' => 'nullable|string|max:300',
            'tags' => 'nullable|array',
            'tags.*' => 'string|max:50',
        ]);

        $old = $media->only(['title', 'alt_text', 'tags']);
        $media->fill($validated);
        $media->save();

        $this->audit->log('media.updated', 'Media', (int) $media->id, $old, $media->only(['title', 'alt_text', 'tags']), [], $request);

        return response()->json(['data' => $media->fresh(['collections'])]);
    }

    public function destroy(Request $request, Media $media): JsonResponse
    {
        $force = $request->boolean('force');
        $usage = $this->usage->for($media);
        if ($usage !== [] && !$force) {
            return response()->json([
                'message' => 'Media is in use and cannot be deleted.',
                'usage' => $usage,
            ], 409);
        }

        $id = $this->deleteAsset($media, $force, $request);

        return response()->json(['ok' => true, 'id' => $id]);
    }

    /**
     * Delete many catalog rows in one request (Media Library multi-select).
     *
     * @return JsonResponse{deleted: list<int>, blocked: list<array{id: int, usage: list<mixed>}>}
     */
    public function bulkDestroy(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids' => 'required|array|min:1|max:100',
            'ids.*' => 'integer|distinct',
            'force' => 'sometimes|boolean',
        ]);
        $force = (bool) ($validated['force'] ?? false);
        /** @var list<int> $ids */
        $ids = array_values(array_map('intval', $validated['ids']));

        $assets = Media::query()->whereIn('id', $ids)->get()->keyBy('id');
        $deleted = [];
        $blocked = [];
        $missing = [];

        foreach ($ids as $id) {
            /** @var Media|null $media */
            $media = $assets->get($id);
            if (!$media) {
                $missing[] = $id;
                continue;
            }
            $usage = $this->usage->for($media);
            if ($usage !== [] && !$force) {
                $blocked[] = ['id' => $id, 'usage' => $usage];
                continue;
            }
            $deleted[] = $this->deleteAsset($media, $force, $request);
        }

        $this->audit->log(
            'media.bulk_deleted',
            'Media',
            null,
            [],
            [
                'force' => $force,
                'requested' => count($ids),
                'deleted' => $deleted,
                'blocked' => array_column($blocked, 'id'),
                'missing' => $missing,
            ],
            [],
            $request,
        );

        return response()->json([
            'deleted' => $deleted,
            'blocked' => $blocked,
            'missing' => $missing,
        ]);
    }

    private function deleteAsset(Media $media, bool $force, Request $request): int
    {
        // Wipe primary + webp sidecars + masters + version backups so
        // reconcile / media:backfill cannot re-catalog leftovers.
        $this->library->purgeDiskFiles($media);

        $id = (int) $media->id;
        $media->delete();
        $this->audit->log('media.deleted', 'Media', $id, [], ['force' => $force], [], $request);

        return $id;
    }

    public function reconcile(Request $request): JsonResponse
    {
        $result = $this->library->reconcile();
        $this->audit->log('media.reconciled', 'Media', null, [], $result, [], $request);

        return response()->json($result);
    }

    public function usage(Media $media): JsonResponse
    {
        return response()->json(['data' => $this->usage->for($media)]);
    }

    public function edit(Request $request, Media $media): JsonResponse
    {
        $validated = $request->validate([
            'op' => 'required|string|in:convert,resize,crop,rotate,thumbnail,optimize',
            'params' => 'nullable|array',
            'mode' => 'required|string|in:replace,copy',
        ]);

        $result = $this->editor->edit(
            $media,
            $validated['op'],
            $validated['params'] ?? [],
            $validated['mode'],
            $request->user(),
            $request,
        );

        return response()->json($result);
    }

    public function restore(Request $request, Media $media): JsonResponse
    {
        $result = $this->editor->restore($media, $request);

        return response()->json($result);
    }

    public function syncCollections(Request $request, Media $media): JsonResponse
    {
        $validated = $request->validate([
            'collection_ids' => 'required|array',
            'collection_ids.*' => 'integer|exists:media_collections,id',
        ]);
        $media->collections()->sync($validated['collection_ids']);
        $this->audit->log(
            'media.collections.updated',
            'Media',
            (int) $media->id,
            [],
            ['collection_ids' => $validated['collection_ids']],
            [],
            $request,
        );

        return response()->json(['data' => $media->fresh(['collections'])]);
    }

    /**
     * Assign a media asset URL to a brand / default-item SiteSetting key.
     * POST /admin/media/{media}/use-as  { key }
     */
    public function useAs(Request $request, Media $media): JsonResponse
    {
        $user = $request->user();
        if (
            !$user
            || (
                !$user->hasPermission('media.manage')
                && !$user->hasPermission('website.manage')
            )
        ) {
            abort(403, 'Missing media.manage or website.manage permission.');
        }

        if ($media->media_type !== 'image') {
            return response()->json(['message' => 'Only image assets can be used as brand/default photos.'], 422);
        }

        // Image "Use as" targets for the shared business record (Business Details).
        $allowed = ['logo', 'logo_dark', 'favicon', 'og_image', 'default_item_image'];
        $validated = $request->validate([
            'key' => ['required', 'string', Rule::in($allowed)],
        ]);
        $key = $validated['key'];
        $url = $media->url;
        if (!$url) {
            return response()->json(['message' => 'Media asset has no public URL.'], 422);
        }

        $old = SiteSetting::get($key);
        $block = ContentRegistry::block($key) ?? [];
        $meta = [
            'type' => (string) ($block['type'] ?? 'image'),
            'group' => (string) ($block['group'] ?? 'Branding'),
            'label' => (string) ($block['label'] ?? $key),
            'description' => is_string($block['description'] ?? null) ? (string) $block['description'] : '',
        ];

        // Write the shared business record only — website/order_app logos are independent.
        $this->ensureSettingRow($key, 'shared', 'en', $meta);
        $this->contentWriter->write(
            $key,
            'shared',
            $url,
            'en',
            $request,
            'content.updated',
            ['source' => 'media.use_as', 'media_id' => (int) $media->id],
        );

        $this->audit->log(
            'media.use_as',
            'Media',
            (int) $media->id,
            ['key' => $key, 'value' => $old],
            ['key' => $key, 'value' => $url],
            [],
            $request,
        );

        return response()->json([
            'message' => match ($key) {
                'default_item_image' => 'Set as default item image (menu).',
                'logo' => 'Set as document logo (Business Details).',
                'logo_dark' => 'Set as document logo (dark) (Business Details).',
                'favicon' => 'Set as document favicon (Business Details).',
                'og_image' => 'Set as OG image (Business Details).',
                default => 'Setting updated.',
            },
            'key' => $key,
            'url' => $url,
        ]);
    }

    /**
     * @param array{type: string, group: string, label: string, description: string} $meta
     */
    private function ensureSettingRow(string $key, string $scope, string $locale, array $meta): void
    {
        $query = SiteSetting::query()->where('key', $key);
        if (SiteSetting::hasScopeColumn()) {
            $query->where('scope', $scope);
        }
        if (SiteSetting::hasLocaleColumn()) {
            $query->where('locale', $locale);
        }
        $row = $query->first();
        if ($row) {
            $row->update([
                'type' => $meta['type'],
                'group' => $meta['group'],
                'label' => $meta['label'],
                'description' => $meta['description'],
                'is_public' => true,
            ]);

            return;
        }

        $attrs = [
            'key' => $key,
            'value' => '',
            'type' => $meta['type'],
            'group' => $meta['group'],
            'label' => $meta['label'],
            'description' => $meta['description'],
            'is_public' => true,
        ];
        if (SiteSetting::hasScopeColumn()) {
            $attrs['scope'] = $scope;
        }
        if (SiteSetting::hasLocaleColumn()) {
            $attrs['locale'] = $locale;
        }
        SiteSetting::query()->create($attrs);
    }
}
