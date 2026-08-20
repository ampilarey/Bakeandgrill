<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Content\ContentIntegrityReport;
use App\Domains\Content\ContentRegistry;
use App\Domains\Content\ContentResolver;
use App\Domains\Content\ContentScopeMismatch;
use App\Domains\Content\ContentValidationService;
use App\Domains\Content\ContentWriter;
use App\Domains\Content\DhivehiFont;
use App\Domains\Media\Services\MediaLibraryService;
use App\Domains\Media\Services\VideoProcessor;
use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateContentRequest;
use App\Http\Resources\ContentBlockResource;
use App\Models\ContentDraft;
use App\Models\ContentRevision;
use App\Models\ContentSchedule;
use App\Models\Media;
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
            'mismatches' => ContentScopeMismatch::collect($locale),
        ]);
    }

    /**
     * GET /api/admin/content/integrity — admin-only Content & Branding audit report.
     */
    public function integrity(): JsonResponse
    {
        return response()->json(ContentIntegrityReport::generate());
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
            'scope' => ['required', 'string', Rule::in(ContentRegistry::APPS)],
            'locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
        ]);
        $locale = $data['locale'] ?? 'en';
        $user = $request->user();
        if (!$user instanceof User) {
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
            'changes.*.scope' => ['required', 'string', Rule::in(ContentRegistry::APPS)],
            'changes.*.locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
            'changes.*.value' => ['nullable'],
        ]);

        $locale = $data['locale'] ?? 'en';
        $user = $request->user();
        if (!$user instanceof User) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }
        $userId = $user->id;
        $saved = [];

        DB::transaction(function () use ($data, $locale, $userId, &$saved): void {
            foreach ($data['changes'] as $change) {
                $key = (string) $change['key'];
                $scope = (string) $change['scope'];
                if (\App\Domains\Settings\OpsOwnedContent::isWriteForbidden($key)) {
                    throw \Illuminate\Validation\ValidationException::withMessages([
                        'changes' => [\App\Domains\Settings\OpsOwnedContent::writeForbiddenMessage($key)],
                        $key => [\App\Domains\Settings\OpsOwnedContent::writeForbiddenMessage($key)],
                    ]);
                }
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
     * DELETE /api/admin/content/drafts — discard the current user's autosaved
     * drafts. Optional `scope` narrows to one app scope; otherwise all scopes
     * for the given locale are discarded. Does not touch live SiteSetting.
     */
    public function discardDrafts(Request $request): JsonResponse
    {
        $data = $request->validate([
            'locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
            'scope' => ['sometimes', 'nullable', 'string', Rule::in(ContentRegistry::APPS)],
            // Narrow to a single block. Without this the only way to abandon
            // one bad hero draft was to discard every unpublished change for
            // the whole app, which is not a trade anyone should have to make.
            'key' => ['sometimes', 'nullable', 'string'],
        ]);
        $locale = $data['locale'] ?? 'en';

        if (!empty($data['key']) && !ContentRegistry::has($data['key'])) {
            return response()->json(['message' => 'Unknown content key.'], 404);
        }
        $user = $request->user();
        if (!$user instanceof User) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $query = ContentDraft::query()
            ->where('user_id', $user->id)
            ->where('locale', $locale);
        if (!empty($data['scope'])) {
            $query->where('scope', $data['scope']);
        }
        if (!empty($data['key'])) {
            $query->where('key', $data['key']);
        }

        $deleted = $query->count();
        $query->delete();

        $this->audit->log(
            action: 'content.draft_discarded',
            modelType: ContentDraft::class,
            modelId: null,
            oldValues: [],
            newValues: ['count' => $deleted],
            meta: ['locale' => $locale, 'scope' => $data['scope'] ?? null, 'key' => $data['key'] ?? null],
            request: $request,
        );

        return response()->json([
            'message' => 'Drafts discarded.',
            'locale' => $locale,
            'scope' => $data['scope'] ?? null,
            'key' => $data['key'] ?? null,
            'deleted' => $deleted,
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
            'scope' => ['required', 'string', Rule::in(ContentRegistry::APPS)],
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
            'changes.*.scope' => ['required', 'string', Rule::in(ContentRegistry::APPS)],
            'changes.*.locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
            'changes.*.value' => ['nullable'],
        ]);

        $locale = $data['locale'] ?? 'en';
        $publishAt = $data['publish_at'];
        $created = [];
        $user = $request->user();
        $userId = $user instanceof User ? $user->id : null;

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
                'user_id' => $userId,
            ]);
            $created[] = $row;
        }

        // Clear matching autosaved drafts so reload doesn't show "Draft saved —
        // not live" for values that are already queued to publish.
        $draftsCleared = 0;
        if ($userId !== null) {
            foreach ($data['changes'] as $change) {
                $key = (string) $change['key'];
                $scope = (string) $change['scope'];
                $changeLocale = (string) ($change['locale'] ?? $locale);
                $draftsCleared += ContentDraft::query()
                    ->where('user_id', $userId)
                    ->where('key', $key)
                    ->where('scope', $scope)
                    ->where('locale', $changeLocale)
                    ->delete();
            }
        }

        $this->audit->log(
            action: 'content.scheduled',
            modelType: ContentSchedule::class,
            modelId: null,
            oldValues: [],
            newValues: [
                'count' => count($created),
                'publish_at' => $publishAt,
                'drafts_cleared' => $draftsCleared,
            ],
            meta: ['locale' => $locale],
            request: $request,
        );

        return response()->json([
            'message' => 'Content scheduled.',
            'schedules' => $created,
            'drafts_cleared' => $draftsCleared,
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

        $scopeFilter = $request->query('scope');
        if ($scopeFilter !== null && $scopeFilter !== '' && !in_array((string) $scopeFilter, ContentRegistry::APPS, true)) {
            return response()->json(['message' => 'Invalid scope. Use website or order_app.'], 422);
        }
        $scopeFilter = $scopeFilter !== null && $scopeFilter !== '' ? (string) $scopeFilter : null;

        $entries = [];
        foreach (ContentRegistry::blocks() as $key => $block) {
            // Content Hub export is Website / Order App only — never the business record.
            foreach (ContentRegistry::APPS as $scope) {
                if ($scopeFilter !== null && $scope !== $scopeFilter) {
                    continue;
                }
                if (!in_array($scope, $block['apps'] ?? [], true)) {
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
            'entries.*.scope' => ['required', 'string', Rule::in(ContentRegistry::APPS)],
            'entries.*.locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
            'entries.*.value' => ['nullable'],
        ]);

        $applied = 0;
        $skipped = 0;
        DB::transaction(function () use ($data, $request, &$applied, &$skipped): void {
            foreach ($data['entries'] as $entry) {
                $locale = $entry['locale'] ?? 'en';
                $value = $entry['value'] ?? '';
                if (is_array($value) || is_object($value)) {
                    $value = json_encode($value, JSON_UNESCAPED_UNICODE);
                }
                $key = (string) $entry['key'];
                $scope = (string) $entry['scope'];
                // Ops / Business Details ownership — never import competing copies.
                if (\App\Domains\Settings\OpsOwnedContent::isWriteForbidden($key)) {
                    $skipped++;
                    continue;
                }
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
            'message' => "Imported {$applied} entries." . ($skipped > 0 ? " Skipped {$skipped} ops-owned keys." : ''),
            'applied' => $applied,
            'skipped' => $skipped,
            'blocks' => ContentBlockResource::collectionFromRegistry('en'),
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
            'scope' => ['required', 'string', Rule::in(ContentRegistry::APPS)],
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
     * Dhivehi webfont upload — validated as a real font with Thaana glyphs.
     * Draft-safe: returns a URL; publish writes the content key.
     */
    public function uploadFont(Request $request): JsonResponse
    {
        $data = $request->validate([
            'key' => ['required', 'string', Rule::in([DhivehiFont::CONTENT_KEY])],
            'scope' => ['required', 'string', Rule::in(ContentRegistry::APPS)],
            'locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
            'file' => ['required', 'file', 'max:2048'],
        ]);

        $key = $data['key'];
        $scope = $data['scope'];
        $locale = $data['locale'] ?? 'en';
        if (ContentRegistry::type($key) !== 'font') {
            return response()->json(['message' => 'Key is not a font block.'], 422);
        }

        try {
            $stored = DhivehiFont::storeUpload($request->file('file'));
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $this->audit->log(
            action: 'content.uploaded',
            modelType: SiteSetting::class,
            modelId: null,
            oldValues: [],
            newValues: ['url' => $stored['url']],
            meta: ['setting_key' => $key, 'scope' => $scope, 'locale' => $locale, 'kind' => 'font'],
            request: $request,
        );

        return response()->json([
            'url' => $stored['url'],
            'format' => $stored['format'],
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
            'scope' => ['required', 'string', Rule::in(ContentRegistry::APPS)],
            'locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
            'video' => ['required', 'file', 'mimetypes:video/mp4,video/webm,video/quicktime', 'max:51200'],
            'poster' => ['nullable', 'file', 'mimes:png,jpg,jpeg,webp', 'max:10240'],
            // Existing slide image / library URL — used when no poster file is uploaded.
            'poster_url' => ['nullable', 'string', 'max:2048'],
        ]);

        if (!$request->hasFile('poster') && blank($data['poster_url'] ?? null)) {
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
            if (!Schema::hasTable('media_assets')) {
                return null;
            }

            return $this->library->registerPath(
                $path,
                'content',
                $request->user() instanceof User ? $request->user() : null,
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
