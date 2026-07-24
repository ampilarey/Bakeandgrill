<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Content\ContentRegistry;
use App\Domains\Content\ContentResolver;
use App\Domains\Content\ContentWriter;
use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateContentRequest;
use App\Http\Resources\ContentBlockResource;
use App\Models\ContentRevision;
use App\Models\ContentSchedule;
use App\Models\SiteSetting;
use App\Services\AuditLogService;
use App\Services\MenuImageProcessor;
use App\Support\ContentSanitizer;
use App\Support\MediaFileCleaner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class ContentController extends Controller
{
    public function __construct(
        private readonly AuditLogService $audit,
        private readonly MenuImageProcessor $processor,
        private readonly ContentWriter $writer,
    ) {}

    /**
     * GET /api/content?app=order_app|website&locale=en|dv
     */
    public function public(Request $request): JsonResponse
    {
        $app = (string) $request->query('app', 'order_app');
        $locale = (string) $request->query('locale', 'en');
        if (!in_array($app, ContentRegistry::APPS, true)) {
            return response()->json(['message' => 'Invalid app. Use order_app or website.'], 422);
        }
        if (!in_array($locale, ContentRegistry::LOCALES, true)) {
            return response()->json(['message' => 'Invalid locale. Use en or dv.'], 422);
        }

        $content = ContentResolver::for($app, $locale)->allPublic();

        return response()->json([
            'app' => $app,
            'locale' => $locale,
            'content' => $content,
            'settings' => $content,
        ]);
    }

    /**
     * GET /api/admin/content?locale=en
     */
    public function index(Request $request): JsonResponse
    {
        $locale = (string) $request->query('locale', 'en');
        if (!in_array($locale, ContentRegistry::LOCALES, true)) {
            return response()->json(['message' => 'Invalid locale.'], 422);
        }

        return response()->json([
            'locale' => $locale,
            'locales' => ContentRegistry::LOCALES,
            'blocks' => ContentBlockResource::collectionFromRegistry($locale),
        ]);
    }

    /**
     * PUT /api/admin/content
     */
    public function update(UpdateContentRequest $request): JsonResponse
    {
        $changes = $request->validated('changes');
        $locale = (string) ($request->validated('locale') ?? 'en');

        foreach ($changes as $change) {
            $key = (string) $change['key'];
            $scope = (string) $change['scope'];
            $changeLocale = (string) ($change['locale'] ?? $locale);
            $value = $change['value'] ?? null;

            if (is_array($value) || is_object($value)) {
                $value = json_encode($value, JSON_UNESCAPED_UNICODE);
            }
            if ($value === null) {
                $value = '';
            }

            $this->ensureRow($key, $scope, $changeLocale);
            $this->writer->write($key, $scope, (string) $value, $changeLocale, $request);
        }

        SiteSetting::bust();

        return response()->json([
            'message' => 'Content published.',
            'blocks' => ContentBlockResource::collectionFromRegistry($locale),
        ]);
    }

    /**
     * GET /api/admin/content/drafts?scope=website&locale=en
     */
    public function drafts(Request $request): JsonResponse
    {
        $data = $request->validate([
            'scope' => ['required', 'string', Rule::in(ContentRegistry::SCOPES)],
            'locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
        ]);
        $locale = $data['locale'] ?? 'en';

        $rows = ContentRevision::query()
            ->where('is_draft', true)
            ->where('scope', $data['scope'])
            ->where('locale', $locale)
            ->orderByDesc('id')
            ->get(['id', 'key', 'scope', 'locale', 'value', 'user_id', 'created_at']);

        $draftMap = [];
        foreach ($rows as $row) {
            // Newest draft wins per key.
            if (!array_key_exists($row->key, $draftMap)) {
                $draftMap[$row->key] = (string) ($row->value ?? '');
            }
        }

        $savedAt = $rows->first()?->created_at?->toIso8601String();

        return response()->json([
            'scope' => $data['scope'],
            'locale' => $locale,
            'drafts' => $draftMap,
            'saved_at' => $savedAt,
        ]);
    }

    /**
     * PUT /api/admin/content/drafts — autosave unpublished drafts (does not touch live SiteSetting).
     */
    public function saveDrafts(Request $request): JsonResponse
    {
        $data = $request->validate([
            'locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
            'changes' => ['required', 'array', 'min:1'],
            'changes.*.key' => ['required', 'string', Rule::in(array_keys(ContentRegistry::blocks()))],
            'changes.*.scope' => ['required', 'string', Rule::in(ContentRegistry::SCOPES)],
            'changes.*.locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
            'changes.*.value' => ['nullable'],
        ]);

        $locale = $data['locale'] ?? 'en';
        $userId = $request->user() instanceof \App\Models\User ? $request->user()->id : null;
        $saved = [];

        DB::transaction(function () use ($data, $locale, $userId, &$saved): void {
            foreach ($data['changes'] as $change) {
                $key = (string) $change['key'];
                $scope = (string) $change['scope'];
                $changeLocale = (string) ($change['locale'] ?? $locale);
                $value = $change['value'] ?? '';
                if (is_array($value) || is_object($value)) {
                    $value = json_encode($value, JSON_UNESCAPED_UNICODE);
                }
                $value = (string) $value;

                if (ContentRegistry::isRich($key) || ContentRegistry::type($key) === 'textarea') {
                    $value = ContentSanitizer::clean($value);
                }

                $draft = ContentRevision::query()
                    ->where('key', $key)
                    ->where('scope', $scope)
                    ->where('locale', $changeLocale)
                    ->where('is_draft', true)
                    ->first();

                if ($draft) {
                    $draft->value = $value;
                    $draft->user_id = $userId;
                    $draft->created_at = now();
                    $draft->save();
                } else {
                    $draft = ContentRevision::query()->create([
                        'key' => $key,
                        'scope' => $scope,
                        'locale' => $changeLocale,
                        'value' => $value,
                        'is_draft' => true,
                        'published_at' => null,
                        'user_id' => $userId,
                        'created_at' => now(),
                    ]);
                }

                $saved[$key] = (string) ($draft->value ?? '');
            }
        });

        $this->audit->log(
            action: 'content.draft_saved',
            modelType: ContentRevision::class,
            modelId: null,
            oldValues: [],
            newValues: ['keys' => array_keys($saved)],
            meta: ['locale' => $locale, 'count' => count($saved)],
            request: $request,
        );

        return response()->json([
            'message' => 'Draft saved.',
            'drafts' => $saved,
            'saved_at' => now()->toIso8601String(),
        ]);
    }

    /**
     * GET /api/admin/content/media — browse owned content uploads for reuse.
     */
    public function media(Request $request): JsonResponse
    {
        $disk = Storage::disk('public');
        $items = [];

        foreach (['site', 'site/website', 'site/order_app'] as $dir) {
            if (!$disk->exists($dir)) {
                continue;
            }
            foreach ($disk->allFiles($dir) as $path) {
                // Skip masters/thumbs/video posters nesting noise for thumbs — still list images.
                if (preg_match('/\.(jpe?g|png|webp)$/i', $path) !== 1) {
                    continue;
                }
                if (str_contains($path, '/masters/') || str_contains($path, '/video/')) {
                    continue;
                }
                $url = '/storage/' . ltrim($path, '/');
                $thumbCandidate = preg_replace('#^(site(?:/website|/order_app)?)/#', '$1/thumbs/', $path) ?? $path;
                $thumbUrl = $disk->exists($thumbCandidate) ? '/storage/' . ltrim($thumbCandidate, '/') : null;
                $items[] = [
                    'url' => $url,
                    'thumb_url' => $thumbUrl,
                    'name' => basename($path),
                    'updated_at' => date('c', $disk->lastModified($path)),
                ];
            }
        }

        usort($items, static fn (array $a, array $b): int => strcmp((string) ($b['updated_at'] ?? ''), (string) ($a['updated_at'] ?? '')));

        return response()->json([
            'items' => array_slice($items, 0, 200),
        ]);
    }

    /**
     * GET /api/admin/content/{key}/revisions
     */
    public function revisions(Request $request, string $key): JsonResponse
    {
        if (!ContentRegistry::has($key)) {
            return response()->json(['message' => 'Unknown content key.'], 404);
        }

        $data = $request->validate([
            'scope' => ['required', 'string', Rule::in(ContentRegistry::SCOPES)],
            'locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
        ]);
        $locale = $data['locale'] ?? 'en';

        $rows = ContentRevision::query()
            ->where('key', $key)
            ->where('scope', $data['scope'])
            ->where('locale', $locale)
            ->where(function ($q) {
                $q->where('is_draft', false)->orWhereNull('is_draft');
            })
            ->orderByDesc('id')
            ->limit(50)
            ->get(['id', 'key', 'scope', 'locale', 'value', 'user_id', 'created_at', 'published_at']);

        return response()->json(['revisions' => $rows]);
    }

    /**
     * POST /api/admin/content/{key}/revisions/{id}/restore
     */
    public function restoreRevision(Request $request, string $key, int $id): JsonResponse
    {
        if (!ContentRegistry::has($key)) {
            return response()->json(['message' => 'Unknown content key.'], 404);
        }

        $rev = ContentRevision::query()->where('id', $id)->where('key', $key)->first();
        if (!$rev) {
            return response()->json(['message' => 'Revision not found.'], 404);
        }

        $this->ensureRow($key, $rev->scope, $rev->locale);
        $this->writer->write(
            $key,
            $rev->scope,
            (string) ($rev->value ?? ''),
            $rev->locale,
            $request,
            'content.restored',
            ['revision_id' => $rev->id],
        );

        SiteSetting::bust();

        return response()->json([
            'message' => 'Revision restored.',
            'blocks' => ContentBlockResource::collectionFromRegistry($rev->locale),
        ]);
    }

    /**
     * POST /api/admin/content/schedule
     */
    public function schedule(Request $request): JsonResponse
    {
        $data = $request->validate([
            'publish_at' => ['required', 'date', 'after:now'],
            'locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
            'changes' => ['required', 'array', 'min:1'],
            'changes.*.key' => ['required', 'string', Rule::in(array_keys(ContentRegistry::blocks()))],
            'changes.*.scope' => ['required', 'string', Rule::in(ContentRegistry::SCOPES)],
            'changes.*.locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
            'changes.*.value' => ['nullable'],
        ]);

        $locale = $data['locale'] ?? 'en';
        $publishAt = $data['publish_at'];
        $created = [];

        foreach ($data['changes'] as $change) {
            $value = $change['value'] ?? '';
            if (is_array($value) || is_object($value)) {
                $value = json_encode($value, JSON_UNESCAPED_UNICODE);
            }
            $row = ContentSchedule::query()->create([
                'key' => $change['key'],
                'scope' => $change['scope'],
                'locale' => $change['locale'] ?? $locale,
                'value' => (string) $value,
                'publish_at' => $publishAt,
                'status' => ContentSchedule::STATUS_PENDING,
                'user_id' => $request->user()?->id,
            ]);
            $created[] = $row;
        }

        $this->audit->log(
            action: 'content.scheduled',
            modelType: ContentSchedule::class,
            modelId: null,
            oldValues: [],
            newValues: ['count' => count($created), 'publish_at' => $publishAt],
            meta: ['locale' => $locale],
            request: $request,
        );

        return response()->json([
            'message' => 'Content scheduled.',
            'schedules' => $created,
        ], 201);
    }

    /**
     * GET /api/admin/content/schedules
     */
    public function schedules(Request $request): JsonResponse
    {
        $status = $request->query('status', ContentSchedule::STATUS_PENDING);
        $rows = ContentSchedule::query()
            ->when($status, fn ($q) => $q->where('status', $status))
            ->orderBy('publish_at')
            ->limit(100)
            ->get();

        return response()->json(['schedules' => $rows]);
    }

    /**
     * DELETE /api/admin/content/schedules/{id}
     */
    public function cancelSchedule(Request $request, int $id): JsonResponse
    {
        $row = ContentSchedule::query()->find($id);
        if (!$row) {
            return response()->json(['message' => 'Schedule not found.'], 404);
        }
        if ($row->status !== ContentSchedule::STATUS_PENDING) {
            return response()->json(['message' => 'Only pending schedules can be cancelled.'], 422);
        }
        $row->status = ContentSchedule::STATUS_CANCELLED;
        $row->save();

        $this->audit->log(
            action: 'content.schedule_cancelled',
            modelType: ContentSchedule::class,
            modelId: $row->id,
            oldValues: ['status' => 'pending'],
            newValues: ['status' => 'cancelled'],
            meta: ['setting_key' => $row->key],
            request: $request,
        );

        return response()->json(['message' => 'Schedule cancelled.', 'schedule' => $row]);
    }

    /**
     * GET /api/admin/content/export
     */
    public function export(Request $request): JsonResponse
    {
        $locale = (string) $request->query('locale', 'en');
        if (!in_array($locale, ContentRegistry::LOCALES, true)) {
            return response()->json(['message' => 'Invalid locale.'], 422);
        }

        $entries = [];
        foreach (ContentRegistry::blocks() as $key => $block) {
            foreach (ContentRegistry::SCOPES as $scope) {
                if ($scope !== 'shared' && !in_array($scope, $block['apps'] ?? [], true)) {
                    continue;
                }
                $value = SiteSetting::getScoped((string) $key, $scope, $locale);
                if ($value === null || $value === '') {
                    continue;
                }
                $entries[] = [
                    'key' => (string) $key,
                    'scope' => $scope,
                    'locale' => $locale,
                    'value' => $value,
                ];
            }
        }

        return response()->json([
            'version' => 1,
            'exported_at' => now()->toIso8601String(),
            'locale' => $locale,
            'entries' => $entries,
        ]);
    }

    /**
     * POST /api/admin/content/import
     */
    public function import(Request $request): JsonResponse
    {
        $data = $request->validate([
            'version' => ['sometimes', 'integer'],
            'entries' => ['required', 'array', 'min:1'],
            'entries.*.key' => ['required', 'string', Rule::in(array_keys(ContentRegistry::blocks()))],
            'entries.*.scope' => ['required', 'string', Rule::in(ContentRegistry::SCOPES)],
            'entries.*.locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
            'entries.*.value' => ['nullable'],
        ]);

        $applied = 0;
        DB::transaction(function () use ($data, $request, &$applied): void {
            foreach ($data['entries'] as $entry) {
                $locale = $entry['locale'] ?? 'en';
                $value = $entry['value'] ?? '';
                if (is_array($value) || is_object($value)) {
                    $value = json_encode($value, JSON_UNESCAPED_UNICODE);
                }
                $this->ensureRow($entry['key'], $entry['scope'], $locale);
                $this->writer->write(
                    $entry['key'],
                    $entry['scope'],
                    (string) $value,
                    $locale,
                    $request,
                    'content.imported',
                );
                $applied++;
            }
        });

        SiteSetting::bust();

        return response()->json([
            'message' => "Imported {$applied} entries.",
            'applied' => $applied,
            'blocks' => ContentBlockResource::collectionFromRegistry('en'),
        ]);
    }

    public function share(Request $request, string $key): JsonResponse
    {
        if (!ContentRegistry::has($key) || !ContentRegistry::isShareable($key)) {
            return response()->json(['message' => 'Block cannot be shared.'], 422);
        }

        $locale = (string) $request->input('locale', 'en');

        foreach (['website', 'order_app'] as $scope) {
            $query = SiteSetting::query()->where('key', $key)->where('scope', $scope);
            if (SiteSetting::hasLocaleColumn() && $request->filled('locale')) {
                $query->where('locale', $locale);
            }
            foreach ($query->get() as $row) {
                $old = $row->value;
                MediaFileCleaner::deleteIfOwnedAndUnreferenced($row->value);
                $row->delete();
                $this->audit->log(
                    action: 'content.shared',
                    modelType: SiteSetting::class,
                    modelId: null,
                    oldValues: ['value' => $old, 'scope' => $scope],
                    newValues: [],
                    meta: ['setting_key' => $key, 'scope' => $scope, 'locale' => $row->locale ?? 'en'],
                    request: $request,
                );
            }
        }

        SiteSetting::bust();

        return response()->json([
            'message' => 'Overrides removed; block is shared.',
            'blocks' => ContentBlockResource::collectionFromRegistry($locale),
        ]);
    }

    public function split(Request $request, string $key): JsonResponse
    {
        if (!ContentRegistry::has($key) || !ContentRegistry::isShareable($key)) {
            return response()->json(['message' => 'Block cannot be split.'], 422);
        }

        $locale = (string) $request->input('locale', 'en');
        $shared = SiteSetting::getScoped($key, 'shared', $locale);
        if ($shared === null || $shared === '') {
            $shared = (string) (ContentRegistry::default($key) ?? '');
        }

        foreach (ContentRegistry::appsFor($key) as $app) {
            $existing = SiteSetting::getScoped($key, $app, $locale);
            if ($existing !== null && $existing !== '') {
                continue;
            }
            $this->ensureRow($key, $app, $locale);
            $this->writer->write($key, $app, $shared, $locale, $request, 'content.split');
        }

        SiteSetting::bust();

        return response()->json([
            'message' => 'Block split per app.',
            'blocks' => ContentBlockResource::collectionFromRegistry($locale),
        ]);
    }

    public function copy(Request $request, string $key): JsonResponse
    {
        if (!ContentRegistry::has($key)) {
            return response()->json(['message' => 'Unknown content key.'], 404);
        }

        $data = $request->validate([
            'from' => ['required', 'string', Rule::in(ContentRegistry::SCOPES)],
            'to' => ['required', 'string', Rule::in(ContentRegistry::SCOPES)],
            'locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
        ]);

        $from = $data['from'];
        $to = $data['to'];
        $locale = $data['locale'] ?? 'en';
        if ($from === $to) {
            return response()->json(['message' => 'from and to must differ.'], 422);
        }

        // Copy the RESOLVED source value so seed/shared content is included when the
        // source app has no override row yet (app → shared → default).
        if (in_array($from, ContentRegistry::APPS, true)) {
            $resolved = ContentResolver::for($from, $locale)->get($key);
            $value = $resolved !== null && $resolved !== ''
                ? (string) $resolved
                : (string) (ContentRegistry::default($key) ?? '');
        } else {
            $value = SiteSetting::getScoped($key, $from, $locale);
            if ($value === null || $value === '') {
                $value = (string) (ContentRegistry::default($key) ?? '');
            }
        }

        $this->ensureRow($key, $to, $locale);
        $this->writer->write($key, $to, $value, $locale, $request, 'content.copied', [
            'from' => $from,
            'to' => $to,
        ]);

        SiteSetting::bust();

        return response()->json([
            'message' => 'Content copied.',
            'blocks' => ContentBlockResource::collectionFromRegistry($locale),
        ]);
    }

    public function upload(Request $request): JsonResponse
    {
        $data = $request->validate([
            'key' => ['required', 'string', Rule::in(array_keys(ContentRegistry::blocks()))],
            'scope' => ['required', 'string', Rule::in(ContentRegistry::SCOPES)],
            'locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
            'file' => ['required', 'file', 'mimes:png,jpg,jpeg,webp', 'max:10240'],
            'original' => ['sometimes', 'file', 'mimes:png,jpg,jpeg,webp', 'max:10240'],
        ]);

        $key = $data['key'];
        $scope = $data['scope'];
        $locale = $data['locale'] ?? 'en';
        $type = ContentRegistry::type($key);
        $editor = ContentRegistry::block($key)['editor'] ?? null;
        $isDirectImage = $type === 'image';
        $isEmbedUpload = $type === 'json' && in_array($editor, ['hero', 'categories'], true);

        if (!$isDirectImage && !$isEmbedUpload) {
            return response()->json(['message' => 'Key is not an image block.'], 422);
        }

        $file = $request->file('file');
        $dir = $scope === 'shared' ? 'site' : "site/{$scope}";

        try {
            $relative = $this->processor->storeProcessed($file, $dir);
            $thumbRelative = $this->processor->storeThumbnail($file, $dir . '/thumbs');
            // Always keep a high-res master for re-crop (prefer explicit original, else source file).
            $masterSource = $request->hasFile('original') ? $request->file('original') : $file;
            $origRelative = $this->processor->storeMaster($masterSource, $dir . '/masters');
            $originalUrl = '/storage/' . ltrim($origRelative, '/');
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $url = '/storage/' . ltrim($relative, '/');
        $thumbUrl = '/storage/' . ltrim($thumbRelative, '/');

        if ($isDirectImage) {
            $old = SiteSetting::getScoped($key, $scope, $locale);
            $this->ensureRow($key, $scope, $locale);
            $this->writer->write($key, $scope, $url, $locale, $request, 'content.uploaded');

            if ($old && $old !== $url) {
                MediaFileCleaner::deleteIfOwnedAndUnreferenced($old, keepUrls: [$url, $thumbUrl, (string) $originalUrl]);
            }

            SiteSetting::bust();
        } else {
            $this->audit->log(
                action: 'content.uploaded',
                modelType: SiteSetting::class,
                modelId: null,
                oldValues: [],
                newValues: ['url' => $url],
                meta: ['setting_key' => $key, 'scope' => $scope, 'locale' => $locale, 'embed' => true],
                request: $request,
            );
        }

        return response()->json([
            'url' => $url,
            'thumb_url' => $thumbUrl,
            'original_url' => $originalUrl,
            'key' => $key,
            'scope' => $scope,
            'locale' => $locale,
            'embed' => $isEmbedUpload,
        ], 201);
    }

    /**
     * Hero video upload — muted autoplay background (reuses MenuImageProcessor raw + poster).
     */
    public function uploadVideo(Request $request): JsonResponse
    {
        $data = $request->validate([
            'key' => ['required', 'string', Rule::in(['hero_slides'])],
            'scope' => ['required', 'string', Rule::in(ContentRegistry::SCOPES)],
            'locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
            'video' => ['required', 'file', 'mimetypes:video/mp4,video/webm', 'max:51200'],
            'poster' => ['required', 'file', 'mimes:png,jpg,jpeg,webp', 'max:10240'],
        ]);

        $key = $data['key'];
        $scope = $data['scope'];
        $locale = $data['locale'] ?? 'en';
        $dir = $scope === 'shared' ? 'site/video' : "site/{$scope}/video";

        try {
            $video = $request->file('video');
            $poster = $request->file('poster');
            $ext = strtolower((string) $video->getClientOriginalExtension()) ?: 'mp4';
            if (!in_array($ext, ['mp4', 'webm'], true)) {
                $ext = str_contains((string) $video->getMimeType(), 'webm') ? 'webm' : 'mp4';
            }
            $videoRel = $this->processor->storeRaw($video, $dir, $ext);
            $posterRel = $this->processor->storeProcessed($poster, $dir . '/posters');
            $thumbRel = $this->processor->storeThumbnail($poster, $dir . '/thumbs');
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $url = '/storage/' . ltrim($videoRel, '/');
        $posterUrl = '/storage/' . ltrim($posterRel, '/');
        $thumbUrl = '/storage/' . ltrim($thumbRel, '/');

        try {
            if (\Illuminate\Support\Facades\Schema::hasTable('media_assets')) {
                app(\App\Domains\Media\Services\MediaLibraryService::class)->registerPath(
                    $videoRel,
                    'content',
                    $request->user(),
                    null,
                    $thumbUrl,
                    null,
                );
            }
        } catch (\Throwable) {
            // best-effort catalog
        }

        $this->audit->log(
            action: 'content.video_uploaded',
            modelType: SiteSetting::class,
            modelId: null,
            oldValues: [],
            newValues: ['url' => $url, 'poster_url' => $posterUrl],
            meta: ['setting_key' => $key, 'scope' => $scope, 'locale' => $locale],
            request: $request,
        );

        return response()->json([
            'url' => $url,
            'poster_url' => $posterUrl,
            'thumb_url' => $thumbUrl,
            'key' => $key,
            'scope' => $scope,
            'locale' => $locale,
        ], 201);
    }

    private function ensureRow(string $key, string $scope, string $locale = 'en'): void
    {
        $query = SiteSetting::query()->where('key', $key)->where('scope', $scope);
        if (SiteSetting::hasLocaleColumn()) {
            $query->where('locale', $locale);
        }
        if ($query->exists()) {
            return;
        }

        $block = ContentRegistry::block($key) ?? [];
        $attrs = [
            'key' => $key,
            'scope' => $scope,
            'value' => '',
            'type' => (string) ($block['type'] ?? 'text'),
            'group' => (string) ($block['group'] ?? 'General'),
            'label' => (string) ($block['label'] ?? $key),
            'description' => null,
            'is_public' => (bool) ($block['public'] ?? false),
        ];
        if (SiteSetting::hasLocaleColumn()) {
            $attrs['locale'] = $locale;
        }
        SiteSetting::query()->create($attrs);
    }
}
