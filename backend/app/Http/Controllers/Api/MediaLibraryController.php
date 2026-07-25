<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Media\Services\MediaEditor;
use App\Domains\Media\Services\MediaLibraryService;
use App\Domains\Media\Services\MediaUsageResolver;
use App\Http\Controllers\Controller;
use App\Models\Media;
use App\Models\SiteSetting;
use App\Services\AuditLogService;
use App\Support\MediaFileCleaner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

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

        $allowed = ['default_item_image', 'favicon', 'logo', 'logo_dark', 'og_image'];
        $validated = $request->validate([
            'key' => ['required', 'string', Rule::in($allowed)],
        ]);
        $key = $validated['key'];
        $url = $media->url;
        if (!$url) {
            return response()->json(['message' => 'Media asset has no public URL.'], 422);
        }

        $old = SiteSetting::get($key);
        $meta = match ($key) {
            'default_item_image' => [
                'type' => 'image',
                'group' => 'Branding',
                'label' => 'Default item photo',
                'description' => 'Shown for menu items that don\'t have their own photo.',
            ],
            'logo' => ['type' => 'image', 'group' => 'Branding', 'label' => 'Logo (Light)', 'description' => ''],
            'logo_dark' => ['type' => 'image', 'group' => 'Branding', 'label' => 'Logo (Dark)', 'description' => ''],
            'favicon' => ['type' => 'image', 'group' => 'Branding', 'label' => 'Favicon', 'description' => ''],
            'og_image' => ['type' => 'image', 'group' => 'SEO', 'label' => 'OG Image', 'description' => ''],
            default => ['type' => 'image', 'group' => 'Branding', 'label' => $key, 'description' => ''],
        };

        SiteSetting::set($key, $url);
        $row = SiteSetting::query()->where('key', $key);
        if (SiteSetting::hasScopeColumn()) {
            $row->where('scope', 'shared');
        }
        if (SiteSetting::hasLocaleColumn()) {
            $row->where('locale', 'en');
        }
        $row->update([
            'type' => $meta['type'],
            'group' => $meta['group'],
            'label' => $meta['label'],
            'description' => $meta['description'],
            'is_public' => true,
        ]);
        SiteSetting::bust();

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
                'default_item_image' => 'Set as default item image.',
                'logo' => 'Set as logo.',
                'logo_dark' => 'Set as dark logo.',
                'favicon' => 'Set as favicon.',
                'og_image' => 'Set as OG image.',
                default => 'Setting updated.',
            },
            'key' => $key,
            'url' => $url,
        ]);
    }
}
