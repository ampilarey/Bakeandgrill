<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Media\Services\MediaEditor;
use App\Domains\Media\Services\MediaLibraryService;
use App\Domains\Media\Services\MediaUsageResolver;
use App\Http\Controllers\Controller;
use App\Models\Media;
use App\Services\AuditLogService;
use App\Support\MediaFileCleaner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class MediaLibraryController extends Controller
{
    public function __construct(
        private readonly MediaLibraryService $library,
        private readonly MediaUsageResolver $usage,
        private readonly MediaEditor $editor,
        private readonly AuditLogService $audit,
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

            return $this->presentAsset($m, count($usage));
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

        return response()->json(['data' => $this->presentAsset($media->fresh(['collections']))]);
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

        $paths = array_filter([
            $media->path,
            MediaFileCleaner::storagePathFromUrl($media->thumb_url),
            MediaFileCleaner::storagePathFromUrl($media->original_url),
        ]);
        foreach ($paths as $path) {
            if (Storage::disk('public')->exists($path)) {
                Storage::disk('public')->delete($path);
            }
        }

        $id = (int) $media->id;
        $media->delete();
        $this->audit->log('media.deleted', 'Media', $id, [], ['force' => $force], [], $request);

        return response()->json(['ok' => true]);
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

        $asset = $result['asset'];
        if ($asset instanceof Media) {
            $result['asset'] = $this->presentAsset($asset);
        }

        return response()->json($result);
    }

    public function restore(Request $request, Media $media): JsonResponse
    {
        $result = $this->editor->restore($media, $request);
        $asset = $result['asset'] ?? null;
        if ($asset instanceof Media) {
            $result['asset'] = $this->presentAsset($asset);
        }

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
     * Point a brand SiteSetting (logo / favicon / og) at this library image.
     * Writes shared + website + order_app so Content Studio app overrides cannot shadow it.
     */
    public function useAs(Request $request, Media $media): JsonResponse
    {
        $user = $request->user();
        if (!$user || (!$user->hasPermission('media.manage') && !$user->hasPermission('website.manage'))) {
            abort(403, 'Forbidden.');
        }

        $validated = $request->validate([
            'key' => 'required|string|in:favicon,logo,logo_dark,og_image',
        ]);
        if ($media->media_type !== 'image') {
            return response()->json(['message' => 'Only images can be used as brand assets.'], 422);
        }

        $key = $validated['key'];
        $url = $key === 'favicon'
            ? $this->editor->makeSquarePngDerivative($media, 180)
            : (string) $media->url;

        if (!str_starts_with($url, '/storage/')) {
            $url = '/storage/' . ltrim($url, '/');
        }

        $old = \App\Models\SiteSetting::get($key);
        $scopes = ['shared', 'website', 'order_app'];
        foreach ($scopes as $scope) {
            \App\Models\SiteSetting::set($key, $url, $scope, 'en');
            $this->ensureBrandSettingMeta($key, $scope);
        }
        \App\Models\SiteSetting::bust();

        $this->audit->log(
            'media.use_as',
            'Media',
            (int) $media->id,
            ['key' => $key, 'url' => $old],
            ['key' => $key, 'url' => $url, 'scopes' => $scopes],
            ['media_path' => $media->path],
            $request,
        );

        return response()->json([
            'key' => $key,
            'url' => $url,
            'message' => 'Saved to site branding.',
        ]);
    }

    private function ensureBrandSettingMeta(string $key, string $scope): void
    {
        $query = \App\Models\SiteSetting::query()->where('key', $key);
        if (\App\Models\SiteSetting::hasScopeColumn()) {
            $query->where('scope', $scope);
        }
        if (\App\Models\SiteSetting::hasLocaleColumn()) {
            $query->where('locale', 'en');
        }
        $row = $query->first();
        if ($row === null) {
            return;
        }
        $dirty = false;
        if (($row->group ?? '') === '' || $row->group === 'System') {
            $row->group = 'Branding';
            $dirty = true;
        }
        if (($row->type ?? '') === '' || $row->type === 'text') {
            $row->type = 'image';
            $dirty = true;
        }
        if (!$row->is_public) {
            $row->is_public = true;
            $dirty = true;
        }
        $labels = [
            'favicon' => 'Favicon',
            'logo' => 'Logo',
            'logo_dark' => 'Logo (dark)',
            'og_image' => 'OG image',
        ];
        if (($row->label ?? '') === '' || $row->label === $key) {
            $row->label = $labels[$key] ?? $key;
            $dirty = true;
        }
        if ($dirty) {
            $row->save();
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function presentAsset(Media $media, ?int $usageCount = null): array
    {
        $data = $media->toArray();
        $data['updated_at'] = $media->updated_at?->toIso8601String();
        if ($usageCount !== null) {
            $data['usage_count'] = $usageCount;
        }

        return $data;
    }
}
