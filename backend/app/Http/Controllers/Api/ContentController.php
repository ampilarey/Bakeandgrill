<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Content\ContentRegistry;
use App\Domains\Content\ContentResolver;
use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateContentRequest;
use App\Http\Resources\ContentBlockResource;
use App\Models\SiteSetting;
use App\Services\AuditLogService;
use App\Services\MenuImageProcessor;
use App\Support\ContentSanitizer;
use App\Support\MediaFileCleaner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ContentController extends Controller
{
    public function __construct(
        private readonly AuditLogService $audit,
        private readonly MenuImageProcessor $processor,
    ) {}

    /**
     * GET /api/content?app=order_app|website
     */
    public function public(Request $request): JsonResponse
    {
        $app = (string) $request->query('app', 'order_app');
        if (!in_array($app, ContentRegistry::APPS, true)) {
            return response()->json([
                'message' => 'Invalid app. Use order_app or website.',
            ], 422);
        }

        $content = ContentResolver::for($app)->allPublic();

        return response()->json([
            'app' => $app,
            'content' => $content,
            'settings' => $content,
        ]);
    }

    /**
     * GET /api/admin/content
     */
    public function index(): JsonResponse
    {
        return response()->json([
            'blocks' => ContentBlockResource::collectionFromRegistry(),
        ]);
    }

    /**
     * PUT /api/admin/content
     */
    public function update(UpdateContentRequest $request): JsonResponse
    {
        $changes = $request->validated('changes');

        foreach ($changes as $change) {
            $key = (string) $change['key'];
            $scope = (string) $change['scope'];
            $value = $change['value'] ?? null;

            if (is_array($value) || is_object($value)) {
                $value = json_encode($value, JSON_UNESCAPED_UNICODE);
            }
            if ($value === null) {
                $value = '';
            }
            $value = (string) $value;

            if (ContentRegistry::isRich($key) || ContentRegistry::type($key) === 'textarea') {
                $value = ContentSanitizer::clean($value);
            }

            $old = SiteSetting::getScoped($key, $scope);
            $this->ensureRow($key, $scope);
            SiteSetting::set($key, $value, $scope);

            $this->audit->log(
                action: 'content.updated',
                modelType: SiteSetting::class,
                modelId: null,
                oldValues: ['value' => $old],
                newValues: ['value' => $value],
                meta: ['setting_key' => $key, 'scope' => $scope],
                request: $request,
            );
        }

        SiteSetting::bust();
        ContentResolver::bust();

        return response()->json([
            'message' => 'Content saved.',
            'blocks' => ContentBlockResource::collectionFromRegistry(),
        ]);
    }

    /**
     * POST /api/admin/content/{key}/share — delete overrides; keep shared.
     */
    public function share(Request $request, string $key): JsonResponse
    {
        if (!ContentRegistry::has($key) || !ContentRegistry::isShareable($key)) {
            return response()->json(['message' => 'Block cannot be shared.'], 422);
        }

        foreach (['website', 'order_app'] as $scope) {
            $row = SiteSetting::query()->where('key', $key)->where('scope', $scope)->first();
            if (!$row) {
                continue;
            }
            $old = $row->value;
            MediaFileCleaner::deleteIfOwnedAndUnreferenced($row->value);
            $row->delete();
            $this->audit->log(
                action: 'content.shared',
                modelType: SiteSetting::class,
                modelId: null,
                oldValues: ['value' => $old, 'scope' => $scope],
                newValues: [],
                meta: ['setting_key' => $key, 'scope' => $scope],
                request: $request,
            );
        }

        SiteSetting::bust();
        ContentResolver::bust();

        return response()->json([
            'message' => 'Overrides removed; block is shared.',
            'blocks' => ContentBlockResource::collectionFromRegistry(),
        ]);
    }

    /**
     * POST /api/admin/content/{key}/split — seed per-app copies from shared.
     */
    public function split(Request $request, string $key): JsonResponse
    {
        if (!ContentRegistry::has($key) || !ContentRegistry::isShareable($key)) {
            return response()->json(['message' => 'Block cannot be split.'], 422);
        }

        $shared = SiteSetting::getScoped($key, 'shared');
        if ($shared === null || $shared === '') {
            $shared = (string) (ContentRegistry::default($key) ?? '');
        }

        foreach (ContentRegistry::appsFor($key) as $app) {
            $existing = SiteSetting::getScoped($key, $app);
            if ($existing !== null && $existing !== '') {
                continue;
            }
            $this->ensureRow($key, $app);
            SiteSetting::set($key, $shared, $app);
            $this->audit->log(
                action: 'content.split',
                modelType: SiteSetting::class,
                modelId: null,
                oldValues: [],
                newValues: ['value' => $shared, 'scope' => $app],
                meta: ['setting_key' => $key, 'scope' => $app],
                request: $request,
            );
        }

        SiteSetting::bust();
        ContentResolver::bust();

        return response()->json([
            'message' => 'Block split per app.',
            'blocks' => ContentBlockResource::collectionFromRegistry(),
        ]);
    }

    /**
     * POST /api/admin/content/{key}/copy — { from: website|order_app|shared, to: ... }
     */
    public function copy(Request $request, string $key): JsonResponse
    {
        if (!ContentRegistry::has($key)) {
            return response()->json(['message' => 'Unknown content key.'], 404);
        }

        $data = $request->validate([
            'from' => ['required', 'string', Rule::in(ContentRegistry::SCOPES)],
            'to' => ['required', 'string', Rule::in(ContentRegistry::SCOPES)],
        ]);

        $from = $data['from'];
        $to = $data['to'];
        if ($from === $to) {
            return response()->json(['message' => 'from and to must differ.'], 422);
        }

        $value = SiteSetting::getScoped($key, $from);
        if ($value === null || $value === '') {
            $value = (string) (ContentRegistry::default($key) ?? '');
        }

        $old = SiteSetting::getScoped($key, $to);
        $this->ensureRow($key, $to);
        SiteSetting::set($key, $value, $to);

        $this->audit->log(
            action: 'content.copied',
            modelType: SiteSetting::class,
            modelId: null,
            oldValues: ['value' => $old],
            newValues: ['value' => $value],
            meta: ['setting_key' => $key, 'from' => $from, 'to' => $to],
            request: $request,
        );

        SiteSetting::bust();
        ContentResolver::bust();

        return response()->json([
            'message' => 'Content copied.',
            'blocks' => ContentBlockResource::collectionFromRegistry(),
        ]);
    }

    /**
     * POST /api/admin/content/upload — cropped scoped image upload.
     */
    public function upload(Request $request): JsonResponse
    {
        $data = $request->validate([
            'key' => ['required', 'string', Rule::in(array_keys(ContentRegistry::blocks()))],
            'scope' => ['required', 'string', Rule::in(ContentRegistry::SCOPES)],
            'file' => ['required', 'file', 'mimes:png,jpg,jpeg,webp', 'max:10240'],
            'original' => ['sometimes', 'file', 'mimes:png,jpg,jpeg,webp', 'max:10240'],
        ]);

        $key = $data['key'];
        $scope = $data['scope'];
        $type = ContentRegistry::type($key);
        $editor = ContentRegistry::block($key)['editor'] ?? null;
        // Direct image blocks persist the URL; JSON visual editors (hero/categories)
        // only store the file under the active scope and return the URL for the client
        // to embed into draft JSON (legacy SiteSettings upload behaviour).
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
            $old = SiteSetting::getScoped($key, $scope);
            $this->ensureRow($key, $scope);
            SiteSetting::set($key, $url, $scope);

            if ($old && $old !== $url) {
                MediaFileCleaner::deleteIfOwnedAndUnreferenced($old, keepUrls: [$url, $thumbUrl, (string) $originalUrl]);
            }

            $this->audit->log(
                action: 'content.uploaded',
                modelType: SiteSetting::class,
                modelId: null,
                oldValues: ['value' => $old],
                newValues: ['value' => $url],
                meta: ['setting_key' => $key, 'scope' => $scope],
                request: $request,
            );

            SiteSetting::bust();
            ContentResolver::bust();
        } else {
            $this->audit->log(
                action: 'content.uploaded',
                modelType: SiteSetting::class,
                modelId: null,
                oldValues: [],
                newValues: ['url' => $url],
                meta: ['setting_key' => $key, 'scope' => $scope, 'embed' => true],
                request: $request,
            );
        }

        return response()->json([
            'url' => $url,
            'thumb_url' => $thumbUrl,
            'original_url' => $originalUrl,
            'key' => $key,
            'scope' => $scope,
            'embed' => $isEmbedUpload,
        ], 201);
    }

    private function ensureRow(string $key, string $scope): void
    {
        $exists = SiteSetting::query()->where('key', $key)->where('scope', $scope)->exists();
        if ($exists) {
            return;
        }

        $block = ContentRegistry::block($key) ?? [];
        SiteSetting::query()->create([
            'key' => $key,
            'scope' => $scope,
            'value' => '',
            'type' => (string) ($block['type'] ?? 'text'),
            'group' => (string) ($block['group'] ?? 'General'),
            'label' => (string) ($block['label'] ?? $key),
            'description' => null,
            'is_public' => (bool) ($block['public'] ?? false),
        ]);
    }
}
