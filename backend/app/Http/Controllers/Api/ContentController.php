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
use App\Support\MediaFileCleaner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
            'message' => 'Content saved.',
            'blocks' => ContentBlockResource::collectionFromRegistry($locale),
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
            ->orderByDesc('id')
            ->limit(50)
            ->get(['id', 'key', 'scope', 'locale', 'value', 'user_id', 'created_at']);

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
            $originalUrl = null;
            if ($request->hasFile('original')) {
                $origRelative = $this->processor->storeMaster($request->file('original'), $dir . '/masters');
                $originalUrl = '/storage/' . ltrim($origRelative, '/');
            }
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
