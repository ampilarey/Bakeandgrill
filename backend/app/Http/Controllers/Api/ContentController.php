<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Content\ContentRegistry;
use App\Domains\Content\ContentResolver;
use App\Domains\Content\ContentValidationService;
use App\Domains\Content\ContentWriter;
use App\Domains\Media\Services\MediaLibraryService;
use App\Domains\Media\Services\VideoProcessor;
use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateContentRequest;
use App\Http\Resources\ContentBlockResource;
use App\Models\ContentDraft;
use App\Models\ContentRevision;
use App\Models\Media;
use App\Models\ContentSchedule;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\MenuImageProcessor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class ContentController extends Controller
{
    public function __construct(
        private readonly AuditLogService $audit,
        private readonly MenuImageProcessor $processor,
        private readonly ContentWriter $writer,
        private readonly VideoProcessor $videos,
        private readonly MediaLibraryService $library,
        private readonly ContentValidationService $contentValidator,
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
        $user = $request->user();
        if (! $user instanceof User) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $rows = ContentDraft::query()
            ->where('user_id', $user->id)
            ->where('scope', $data['scope'])
            ->where('locale', $locale)
            ->orderByDesc('updated_at')
            ->get(['id', 'key', 'scope', 'locale', 'value', 'user_id', 'updated_at']);

        $draftMap = [];
        foreach ($rows as $row) {
            $draftMap[$row->key] = (string) ($row->value ?? '');
        }

        $savedAt = $rows->first()?->updated_at?->toIso8601String();

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
        $user = $request->user();
        if (! $user instanceof User) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }
        $userId = $user->id;
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

                $value = ContentWriter::prepareValue($key, $value);

                $draft = ContentDraft::query()
                    ->where('user_id', $userId)
                    ->where('key', $key)
                    ->where('scope', $scope)
                    ->where('locale', $changeLocale)
                    ->lockForUpdate()
                    ->first();

                if ($draft) {
                    $draft->value = $value;
                    $draft->version = ((int) $draft->version) + 1;
                    $draft->save();
                } else {
                    $draft = ContentDraft::query()->create([
                        'user_id' => $userId,
                        'key' => $key,
                        'scope' => $scope,
                        'locale' => $changeLocale,
                        'value' => $value,
                        'version' => 1,
                    ]);
                }

                $saved[$key] = (string) ($draft->value ?? '');
            }
        });

        $this->audit->log(
            action: 'content.draft_saved',
            modelType: ContentDraft::class,
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
            $key = (string) $change['key'];
            $scope = (string) $change['scope'];
            $changeLocale = (string) ($change['locale'] ?? $locale);
            $value = $this->contentValidator->normalizeForWrite($key, $scope, $value);
            $row = ContentSchedule::query()->create([
                'key' => $key,
                'scope' => $scope,
                'locale' => $changeLocale,
                'value' => $value,
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
                $key = (string) $entry['key'];
                $scope = (string) $entry['scope'];
                $value = $this->contentValidator->normalizeForWrite($key, $scope, $value);
                $this->ensureRow($key, $scope, $locale);
                $this->writer->write(
                    $key,
                    $scope,
                    $value,
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
        $this->contentValidator->assertScopeAllowed($key, 'shared');

        $data = $request->validate([
            'locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
            'source' => ['required', 'string', Rule::in(ContentRegistry::SCOPES)],
            'draft_action' => ['sometimes', 'nullable', 'string', Rule::in(['publish', 'discard', 'migrate'])],
        ]);

        $locale = $data['locale'] ?? 'en';
        $source = $data['source'];
        if (in_array($source, ContentRegistry::APPS, true) && ! ContentRegistry::targetsApp($key, $source)) {
            return response()->json(['message' => 'Selected source is not available for this block.'], 422);
        }

        $user = $request->user();
        if (! $user instanceof User) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $draftAction = $data['draft_action'] ?? null;
        if ($draftAction === null && $this->hasUserDrafts($user->id, $key, $locale)) {
            return $this->draftConflictResponse();
        }

        DB::transaction(function () use ($key, $locale, $source, $request, $user, $draftAction): void {
            $migratedDrafts = $draftAction === 'migrate'
                ? $this->collectDraftMigration($user->id, $key, $locale, 'same', $source)
                : [];
            $this->applyDraftAction($draftAction, $user->id, $key, $locale, $request);

            $value = $this->resolvedValueForSource($key, $source, $locale);
            $this->ensureRow($key, 'shared', $locale);
            $this->writer->write($key, 'shared', $value, $locale, $request, 'content.shared', [
                'source' => $source,
            ], false);

            foreach (ContentRegistry::APPS as $scope) {
                // Do not delete files — Media Library owns asset lifecycle (B7).
                if (SiteSetting::hasScopedValue($key, $scope, $locale)) {
                    $old = SiteSetting::getScoped($key, $scope, $locale);
                    $this->snapshotRevision($key, $scope, $locale, (string) $old, $request);
                }
                SiteSetting::clearScoped($key, $scope, $locale);
            }

            $this->restoreMigratedDrafts($user->id, $key, $locale, $migratedDrafts);
        });

        SiteSetting::bust();

        return response()->json([
            'message' => 'Source copied; block is shared.',
            'blocks' => ContentBlockResource::collectionFromRegistry($locale),
        ]);
    }

    public function split(Request $request, string $key): JsonResponse
    {
        if (!ContentRegistry::has($key) || !ContentRegistry::isShareable($key)) {
            return response()->json(['message' => 'Block cannot be split.'], 422);
        }
        $this->contentValidator->assertScopeAllowed($key, 'shared');

        $data = $request->validate([
            'locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
            'draft_action' => ['sometimes', 'nullable', 'string', Rule::in(['publish', 'discard', 'migrate'])],
        ]);

        $locale = $data['locale'] ?? 'en';
        $user = $request->user();
        if (! $user instanceof User) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $draftAction = $data['draft_action'] ?? null;
        if ($draftAction === null && $this->hasUserDrafts($user->id, $key, $locale)) {
            return $this->draftConflictResponse();
        }

        DB::transaction(function () use ($key, $locale, $request, $user, $draftAction): void {
            $migratedDrafts = $draftAction === 'migrate'
                ? $this->collectDraftMigration($user->id, $key, $locale, 'different')
                : [];
            $this->applyDraftAction($draftAction, $user->id, $key, $locale, $request);

            foreach (ContentRegistry::appsFor($key) as $app) {
                // Use DB existence, not getScoped() — a stale forever-cache after
                // share/clearAppOverrides used to make this loop a no-op while the
                // hub still showed "Same in both".
                if (SiteSetting::hasScopedValue($key, $app, $locale)) {
                    continue;
                }
                // Drop empty/stale rows and cache before resolving, otherwise a
                // stale app-scope forever cache can beat the shared value.
                SiteSetting::clearScoped($key, $app, $locale);
                // Copy each app's resolved value for the active locale. In DV this
                // preserves resolver fallback (app DV → shared DV → app EN → shared EN).
                $resolved = ContentResolver::for($app, $locale)->get($key);
                $value = ($resolved !== null && $resolved !== '')
                    ? (string) $resolved
                    : (string) (ContentRegistry::default($key) ?? '');
                $this->ensureRow($key, $app, $locale);
                $this->writer->write($key, $app, $value, $locale, $request, 'content.split');
            }

            $this->restoreMigratedDrafts($user->id, $key, $locale, $migratedDrafts);
        });

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
        if (\App\Support\MenuImageValidation::looksLikeHeic($request->file('file'))) {
            return response()->json([
                'message' => \App\Support\MenuImageValidation::heicRejectedMessage(),
            ], 422);
        }

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
            $processed = $this->processor->storeProcessedPair($file, $dir);
            $thumb = $this->processor->storeThumbnailPair($file, $dir . '/thumbs');
            // Always keep a high-res master for re-crop (prefer explicit original, else source file).
            $masterSource = $request->hasFile('original') ? $request->file('original') : $file;
            $origRelative = $this->processor->storeMaster($masterSource, $dir . '/masters');
            $originalUrl = '/storage/' . ltrim($origRelative, '/');
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $url = '/storage/' . ltrim($processed['path'], '/');
        $thumbUrl = '/storage/' . ltrim($thumb['path'], '/');
        $imageWebpUrl = $processed['webp_path']
            ? '/storage/' . ltrim($processed['webp_path'], '/')
            : null;
        $thumbWebpUrl = $thumb['webp_path']
            ? '/storage/' . ltrim($thumb['webp_path'], '/')
            : null;

        $media = $this->registerContentAsset(
            path: $processed['path'],
            request: $request,
            title: ContentRegistry::label($key),
            thumbUrl: $thumbUrl,
            originalUrl: $originalUrl,
            imageWebpUrl: $imageWebpUrl,
            thumbWebpUrl: $thumbWebpUrl,
        );

        $this->audit->log(
            action: 'content.uploaded',
            modelType: Media::class,
            modelId: $media?->id,
            oldValues: [],
            newValues: ['url' => $url, 'media_id' => $media?->id],
            meta: ['setting_key' => $key, 'scope' => $scope, 'locale' => $locale, 'embed' => true],
            request: $request,
        );

        return response()->json([
            'url' => $url,
            'thumb_url' => $thumbUrl,
            'image_webp_url' => $imageWebpUrl,
            'thumb_webp_url' => $thumbWebpUrl,
            'original_url' => $originalUrl,
            'media_id' => $media?->id,
            'id' => $media?->id,
            'key' => $key,
            'scope' => $scope,
            'locale' => $locale,
            'embed' => true,
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
            'video' => ['required', 'file', 'mimetypes:video/mp4,video/webm,video/quicktime', 'max:51200'],
            'poster' => ['nullable', 'file', 'mimes:png,jpg,jpeg,webp', 'max:10240'],
            // Existing slide image / library URL — used when no poster file is uploaded.
            'poster_url' => ['nullable', 'string', 'max:2048'],
        ]);

        if (! $request->hasFile('poster') && blank($data['poster_url'] ?? null)) {
            return response()->json([
                'message' => 'A poster image file or poster_url is required.',
            ], 422);
        }

        $key = $data['key'];
        $scope = $data['scope'];
        $locale = $data['locale'] ?? 'en';
        $dir = $scope === 'shared' ? 'site/video' : "site/{$scope}/video";

        try {
            $video = $request->file('video');
            $ext = strtolower((string) $video->getClientOriginalExtension()) ?: 'mp4';
            if (!in_array($ext, ['mp4', 'webm', 'mov'], true)) {
                $mime = (string) $video->getMimeType();
                $ext = match (true) {
                    str_contains($mime, 'webm') => 'webm',
                    str_contains($mime, 'quicktime') => 'mov',
                    default => 'mp4',
                };
            }
            $videoRel = $this->processor->storeRaw($video, $dir, $ext);
            $safe = $this->videos->ensureWebSafe(Storage::disk('public')->path($videoRel));
            $videoRel = $safe['relative_path'];

            if ($request->hasFile('poster')) {
                $poster = $request->file('poster');
                $posterRel = $this->processor->storeProcessed($poster, $dir . '/posters');
                $thumbRel = $this->processor->storeThumbnail($poster, $dir . '/thumbs');
                $posterUrl = '/storage/' . ltrim($posterRel, '/');
                $thumbUrl = '/storage/' . ltrim($thumbRel, '/');
            } else {
                $posterUrl = $this->normalizePublicMediaUrl((string) $data['poster_url']);
                $thumbUrl = $posterUrl;
            }
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $url = '/storage/' . ltrim($videoRel, '/');

        $media = $this->registerContentAsset(
            path: $videoRel,
            request: $request,
            title: ContentRegistry::label($key),
            thumbUrl: $thumbUrl,
        );

        $this->audit->log(
            action: 'content.video_uploaded',
            modelType: Media::class,
            modelId: $media?->id,
            oldValues: [],
            newValues: ['url' => $url, 'poster_url' => $posterUrl, 'media_id' => $media?->id],
            meta: ['setting_key' => $key, 'scope' => $scope, 'locale' => $locale, 'embed' => true],
            request: $request,
        );

        return response()->json([
            'url' => $url,
            'poster_url' => $posterUrl,
            'thumb_url' => $thumbUrl,
            'original_url' => null,
            'image_webp_url' => null,
            'thumb_webp_url' => null,
            'media_id' => $media?->id,
            'id' => $media?->id,
            'key' => $key,
            'scope' => $scope,
            'locale' => $locale,
            'embed' => true,
        ], 201);
    }

    /**
     * Accept relative /storage/… paths or absolute http(s) URLs for poster reuse.
     */
    private function normalizePublicMediaUrl(string $url): string
    {
        $url = trim($url);
        if ($url === '') {
            throw new \InvalidArgumentException('poster_url is empty.');
        }
        if (str_starts_with($url, '/storage/') || str_starts_with($url, 'http://') || str_starts_with($url, 'https://')) {
            return $url;
        }
        if (str_starts_with($url, 'storage/')) {
            return '/' . $url;
        }

        throw new \InvalidArgumentException('poster_url must be a /storage/… path or http(s) URL.');
    }

    private function registerContentAsset(
        string $path,
        Request $request,
        ?string $title = null,
        ?string $thumbUrl = null,
        ?string $originalUrl = null,
        ?string $imageWebpUrl = null,
        ?string $thumbWebpUrl = null,
    ): ?Media {
        try {
            if (! Schema::hasTable('media_assets')) {
                return null;
            }

            return $this->library->registerPath(
                $path,
                'content',
                $request->user() instanceof \App\Models\User ? $request->user() : null,
                $title,
                $thumbUrl,
                $originalUrl,
                $imageWebpUrl,
                $thumbWebpUrl,
            );
        } catch (\Throwable) {
            // Catalog registration is required when available, but uploads must not fail
            // if an older install is mid-migration or the media table is temporarily unavailable.
            return null;
        }
    }

    private function hasUserDrafts(int $userId, string $key, string $locale): bool
    {
        return ContentDraft::query()
            ->where('user_id', $userId)
            ->where('key', $key)
            ->where('locale', $locale)
            ->exists();
    }

    private function draftConflictResponse(): JsonResponse
    {
        return response()->json([
            'message' => 'Unpublished drafts exist for this block. Publish or discard them before changing Same/Different mode.',
        ], 409);
    }

    private function resolvedValueForSource(string $key, string $source, string $locale): string
    {
        if (in_array($source, ContentRegistry::APPS, true)) {
            $value = ContentResolver::for($source, $locale)->get($key);
        } else {
            $value = SiteSetting::getScoped($key, 'shared', $locale);
        }

        return ($value !== null && $value !== '')
            ? (string) $value
            : (string) (ContentRegistry::default($key) ?? '');
    }

    private function snapshotRevision(string $key, string $scope, string $locale, string $value, Request $request): void
    {
        ContentRevision::query()->create([
            'key' => $key,
            'scope' => $scope,
            'locale' => $locale,
            'value' => $value,
            'is_draft' => false,
            'published_at' => now(),
            'user_id' => $request->user() instanceof User ? $request->user()->id : null,
            'created_at' => now(),
        ]);
    }

    private function applyDraftAction(?string $action, int $userId, string $key, string $locale, Request $request): void
    {
        if ($action === null || $action === 'migrate') {
            return;
        }

        $drafts = ContentDraft::query()
            ->where('user_id', $userId)
            ->where('key', $key)
            ->where('locale', $locale)
            ->lockForUpdate()
            ->get();

        if ($action === 'discard') {
            foreach ($drafts as $draft) {
                $draft->delete();
            }

            return;
        }

        foreach ($drafts as $draft) {
            $this->ensureRow($key, (string) $draft->scope, $locale);
            $this->writer->write(
                $key,
                (string) $draft->scope,
                (string) ($draft->value ?? ''),
                $locale,
                $request,
                'content.draft_published',
                ['mode_change' => true],
                false,
            );
        }

        ContentDraft::query()
            ->where('user_id', $userId)
            ->where('key', $key)
            ->where('locale', $locale)
            ->delete();
    }

    /**
     * @return list<array{scope: string, value: string}>
     */
    private function collectDraftMigration(
        int $userId,
        string $key,
        string $locale,
        string $mode,
        ?string $source = null,
    ): array {
        $drafts = ContentDraft::query()
            ->where('user_id', $userId)
            ->where('key', $key)
            ->where('locale', $locale)
            ->lockForUpdate()
            ->get()
            ->keyBy('scope');

        if ($drafts->isEmpty()) {
            return [];
        }

        if ($mode === 'same') {
            $sourceDraft = $source ? $drafts->get($source) : null;
            $draft = $sourceDraft ?? $drafts->get('shared') ?? $drafts->get('website') ?? $drafts->get('order_app');

            return $draft ? [['scope' => 'shared', 'value' => (string) ($draft->value ?? '')]] : [];
        }

        $rows = [];
        $sharedDraft = $drafts->get('shared');
        foreach (ContentRegistry::appsFor($key) as $app) {
            $draft = $drafts->get($app) ?? $sharedDraft;
            if ($draft) {
                $rows[] = ['scope' => $app, 'value' => (string) ($draft->value ?? '')];
            }
        }

        return $rows;
    }

    /**
     * @param list<array{scope: string, value: string}> $drafts
     */
    private function restoreMigratedDrafts(int $userId, string $key, string $locale, array $drafts): void
    {
        if ($drafts === []) {
            return;
        }

        ContentDraft::query()
            ->where('user_id', $userId)
            ->where('key', $key)
            ->where('locale', $locale)
            ->delete();

        foreach ($drafts as $draft) {
            ContentDraft::query()->create([
                'user_id' => $userId,
                'key' => $key,
                'scope' => $draft['scope'],
                'locale' => $locale,
                'value' => ContentWriter::prepareValue($key, $draft['value']),
                'version' => 1,
            ]);
        }
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
