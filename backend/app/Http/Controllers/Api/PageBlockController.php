<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Content\Blocks\BlockTypeDefinition;
use App\Domains\Content\Blocks\BlockTypeRegistry;
use App\Domains\Content\Blocks\GenericBlockPresenter;
use App\Domains\Content\Blocks\PageBlockRepository;
use App\Domains\Content\Blocks\PageBlockValidator;
use App\Domains\Content\ContentDraftStore;
use App\Domains\Content\ContentResolver;
use App\Domains\Content\ContentWriter;
use App\Http\Controllers\Controller;
use App\Models\PageBlock;
use App\Models\PageBlockSharedContent;
use App\Models\PageLayoutDraft;
use App\Models\PageLayoutRevision;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PageBlockController extends Controller
{
    public function __construct(
        private readonly ContentWriter $writer,
    ) {}

    /** Admin: list editable working-copy blocks + available types for an app. */
    public function index(Request $request): JsonResponse
    {
        $app = (string) $request->query('app', PageBlock::APP_WEBSITE);
        $page = (string) $request->query('page', PageBlock::PAGE_HOME);
        $this->assertApp($app);

        $user = $this->staffUser($request);
        $draft = PageLayoutDraft::query()
            ->where('user_id', $user->id)
            ->where('app', $app)
            ->where('page', $page)
            ->first();

        $blocks = $draft instanceof PageLayoutDraft
            ? $this->blocksFromDraft($draft)
            : $this->liveSnapshot($app, $page);
        $unknown = BlockTypeRegistry::unknownTypesAmong(collect($blocks)->pluck('block_type'));

        return response()->json([
            'app' => $app,
            'page' => $page,
            'draft' => $draft instanceof PageLayoutDraft,
            'version' => $draft instanceof PageLayoutDraft ? (int) $draft->version : 0,
            'saved_at' => $draft?->updated_at?->toIso8601String(),
            'blocks' => $blocks,
            'available_types' => array_map(
                fn (BlockTypeDefinition $d) => $this->serializeType($d),
                BlockTypeRegistry::forApp($app),
            ),
            'unknown_types' => $unknown,
        ]);
    }

    /** Public: enabled live blocks, or a short-lived draft preview override. */
    public function publicIndex(Request $request): JsonResponse
    {
        $app = (string) $request->query('app', PageBlock::APP_ORDER);
        $page = (string) $request->query('page', PageBlock::PAGE_HOME);
        $this->assertApp($app);

        $token = trim((string) $request->query('preview_token', ''));
        if ($token !== '') {
            $draft = ContentDraftStore::get($token);
            if ($draft === null) {
                return response()->json(['message' => 'Invalid or expired preview token.'], 403);
            }
            $overrides = $draft['overrides']['page_blocks'][$app][$page] ?? null;
            if (is_array($overrides)) {
                return response()->json([
                    'app' => $app,
                    'page' => $page,
                    'blocks' => $this->serializeDraftBlocks($overrides),
                    'preview' => true,
                    'draft' => true,
                ]);
            }
        }

        $blocks = PageBlockRepository::forPage($app, $page)
            ->filter(fn (PageBlock $b) => $b->is_enabled)
            ->filter(fn (PageBlock $b) => BlockTypeRegistry::get($b->block_type)?->allowsApp($app) === true)
            ->values();

        return response()->json([
            'app' => $app,
            'page' => $page,
            'blocks' => $blocks->map(fn (PageBlock $b) => $this->serialize($b))->values(),
            'preview' => false,
        ]);
    }

    /** Draft create. Live page_blocks are not changed until publish(). */
    public function store(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'app' => ['required', 'string', Rule::in([PageBlock::APP_WEBSITE, PageBlock::APP_ORDER])],
            'page' => ['nullable', 'string', 'max:64'],
            'version' => ['required', 'integer', 'min:0'],
            'block_type' => ['required', 'string', 'max:64'],
            'position' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'is_enabled' => ['nullable', 'boolean'],
            'content_mode' => ['nullable', 'string', Rule::in([PageBlock::MODE_SHARED, PageBlock::MODE_OWN])],
            'settings' => ['nullable', 'array'],
        ]);

        $app = (string) $payload['app'];
        $page = (string) ($payload['page'] ?? PageBlock::PAGE_HOME);
        $this->assertNoOtherDraft($request, $app, $page);

        $result = DB::transaction(function () use ($request, $payload, $app, $page): array {
            [$draft, $blocks] = $this->draftForMutation($request, $app, $page, (int) $payload['version']);

            $data = PageBlockValidator::validateInstance([
                'app' => $app,
                'page' => $page,
                'block_type' => $payload['block_type'],
                'position' => $payload['position'] ?? count($blocks),
                'is_enabled' => $payload['is_enabled'] ?? true,
                'content_mode' => $payload['content_mode'] ?? PageBlock::MODE_SHARED,
                'settings' => $payload['settings'] ?? [],
            ]);
            $this->assertSingletonAvailable($blocks, $data['block_type']);

            $block = $this->draftRowFromData($data, $this->nextDraftId($blocks));
            if ($block['content_mode'] === PageBlock::MODE_SHARED && GenericBlockPresenter::isGeneric($block['block_type'])) {
                $block['shared_content_uuid'] = (string) Str::uuid();
            }

            array_splice($blocks, min((int) $block['position'], count($blocks)), 0, [$block]);
            $blocks = $this->normalizePositions($blocks);

            $draft = $this->saveDraftPayload($draft, $blocks);

            return [$draft, $block['id']];
        });

        [$draft, $createdId] = $result;

        return response()->json([
            'block' => collect($this->blocksFromDraft($draft))->firstWhere('id', $createdId),
            'draft' => true,
            'version' => (int) $draft->version,
        ], 201);
    }

    /** Draft update. Live page_blocks are not changed until publish(). */
    public function update(Request $request, int $id): JsonResponse
    {
        $payload = $request->validate([
            'app' => ['nullable', 'string', Rule::in([PageBlock::APP_WEBSITE, PageBlock::APP_ORDER])],
            'page' => ['nullable', 'string', 'max:64'],
            'version' => ['required', 'integer', 'min:0'],
            'position' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'is_enabled' => ['nullable', 'boolean'],
            'content_mode' => ['nullable', 'string', Rule::in([PageBlock::MODE_SHARED, PageBlock::MODE_OWN])],
            'settings' => ['nullable', 'array'],
            'share_source' => ['nullable', 'string', Rule::in(['website', 'order_app', 'shared'])],
        ]);

        [$app, $page] = $this->appPageForBlockRequest($id, $payload);
        $this->assertNoOtherDraft($request, $app, $page);

        $result = DB::transaction(function () use ($request, $payload, $id, $app, $page): array {
            [$draft, $blocks] = $this->draftForMutation($request, $app, $page, (int) $payload['version']);
            $index = $this->findDraftBlockIndex($blocks, $id);
            $block = $blocks[$index];
            $originalMode = (string) ($block['content_mode'] ?? PageBlock::MODE_SHARED);

            if (array_key_exists('content_mode', $payload)) {
                $nextMode = (string) $payload['content_mode'];
                if ($nextMode === PageBlock::MODE_SHARED && $originalMode === PageBlock::MODE_OWN) {
                    $source = (string) ($payload['share_source'] ?? '');
                    if (! in_array($source, ['website', 'order_app', 'shared'], true)) {
                        throw ValidationException::withMessages([
                            'share_source' => 'Choose Website, Order app, or Shared as the source before sharing this block.',
                        ]);
                    }
                    $block['share_source'] = $source;
                    if (GenericBlockPresenter::isGeneric((string) $block['block_type'])) {
                        $block['settings'] = $this->sourceSettingsForGeneric($block, $source);
                        $block['shared_content_uuid'] = (string) ($block['shared_content_uuid'] ?? Str::uuid());
                    }
                }

                if ($nextMode === PageBlock::MODE_OWN && $originalMode === PageBlock::MODE_SHARED) {
                    $block['settings'] = array_merge(
                        $this->resolvedSettingsForDraftBlock($block),
                        is_array($payload['settings'] ?? null) ? $payload['settings'] : [],
                    );
                    $block['shared_content_id'] = null;
                    $block['shared_content_uuid'] = null;
                    unset($block['share_source']);
                }

                $block['content_mode'] = $nextMode;
            }

            if (array_key_exists('position', $payload)) {
                $block['position'] = (int) $payload['position'];
            }
            if (array_key_exists('is_enabled', $payload)) {
                $block['is_enabled'] = (bool) $payload['is_enabled'];
            }
            if (array_key_exists('settings', $payload) && ! (
                ($payload['content_mode'] ?? null) === PageBlock::MODE_OWN
                && $originalMode === PageBlock::MODE_SHARED
            )) {
                $block['settings'] = $payload['settings'] ?? [];
            }

            $data = PageBlockValidator::validateInstance([
                'app' => $app,
                'page' => $page,
                'block_type' => $block['block_type'],
                'position' => $block['position'],
                'is_enabled' => $block['is_enabled'],
                'content_mode' => $block['content_mode'],
                'settings' => $block['settings'] ?? [],
            ], (string) $block['block_type']);

            $block = array_merge($block, [
                'position' => $data['position'],
                'is_enabled' => $data['is_enabled'],
                'content_mode' => $data['content_mode'],
                'settings' => $data['settings'],
            ]);

            $blocks[$index] = $block;
            $blocks = $this->normalizePositions($blocks);
            $draft = $this->saveDraftPayload($draft, $blocks);

            return [$draft, $id];
        });

        [$draft, $updatedId] = $result;

        return response()->json([
            'block' => collect($this->blocksFromDraft($draft))->firstWhere('id', $updatedId),
            'draft' => true,
            'version' => (int) $draft->version,
        ]);
    }

    /** Draft delete. Live page_blocks are not changed until publish(). */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $payload = $request->validate([
            'app' => ['nullable', 'string', Rule::in([PageBlock::APP_WEBSITE, PageBlock::APP_ORDER])],
            'page' => ['nullable', 'string', 'max:64'],
            'version' => ['required', 'integer', 'min:0'],
        ]);

        [$app, $page] = $this->appPageForBlockRequest($id, $payload);
        $this->assertNoOtherDraft($request, $app, $page);

        $draft = DB::transaction(function () use ($request, $payload, $id, $app, $page): PageLayoutDraft {
            [$draft, $blocks] = $this->draftForMutation($request, $app, $page, (int) $payload['version']);
            $index = $this->findDraftBlockIndex($blocks, $id);
            PageBlockValidator::assertCanDelete((string) $blocks[$index]['block_type']);
            array_splice($blocks, $index, 1);

            return $this->saveDraftPayload($draft, $this->normalizePositions($blocks));
        });

        return response()->json([
            'message' => 'Block removed from draft.',
            'draft' => true,
            'version' => (int) $draft->version,
            'blocks' => $this->blocksFromDraft($draft),
        ]);
    }

    /** Draft reorder / bulk toggle. Live page_blocks are not changed until publish(). */
    public function reorder(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'app' => ['required', 'string', Rule::in([PageBlock::APP_WEBSITE, PageBlock::APP_ORDER])],
            'page' => ['nullable', 'string', 'max:64'],
            'version' => ['required', 'integer', 'min:0'],
            'blocks' => ['required', 'array', 'min:1'],
            'blocks.*.id' => ['required', 'integer'],
            'blocks.*.position' => ['required', 'integer', 'min:0'],
            'blocks.*.is_enabled' => ['required', 'boolean'],
        ]);

        $app = (string) $payload['app'];
        $page = (string) ($payload['page'] ?? PageBlock::PAGE_HOME);
        $this->assertNoOtherDraft($request, $app, $page);

        $draft = DB::transaction(function () use ($request, $payload, $app, $page): PageLayoutDraft {
            [$draft, $blocks] = $this->draftForMutation($request, $app, $page, (int) $payload['version']);
            $byId = [];
            foreach ($blocks as $block) {
                $byId[(int) $block['id']] = $block;
            }

            $sentIds = collect($payload['blocks'])->pluck('id')->map(fn ($v) => (int) $v)->sort()->values()->all();
            $knownIds = collect(array_keys($byId))->map(fn ($v) => (int) $v)->sort()->values()->all();
            if ($sentIds !== $knownIds) {
                throw ValidationException::withMessages([
                    'blocks' => 'Reorder must include every block in this draft. Reload the layout editor and try again.',
                ]);
            }

            $next = [];
            foreach ($payload['blocks'] as $row) {
                $block = $byId[(int) $row['id']];
                if ($row['is_enabled'] === false && ! BlockTypeRegistry::isRemovable((string) $block['block_type'])) {
                    $def = BlockTypeRegistry::get((string) $block['block_type']);
                    throw ValidationException::withMessages([
                        'blocks' => $def?->nonRemovableReason
                            ?? "“{$block['block_type']}” cannot be turned off.",
                    ]);
                }
                $block['position'] = (int) $row['position'];
                $block['is_enabled'] = (bool) $row['is_enabled'];
                $next[] = $block;
            }

            usort($next, fn (array $a, array $b): int => ((int) $a['position']) <=> ((int) $b['position']));

            return $this->saveDraftPayload($draft, $this->normalizePositions($next));
        });

        return response()->json([
            'app' => $app,
            'page' => $page,
            'draft' => true,
            'version' => (int) $draft->version,
            'blocks' => $this->blocksFromDraft($draft),
        ]);
    }

    /** Create a preview token from the saved page-layout draft, or live layout when no draft exists. */
    public function previewToken(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'app' => ['required', 'string', Rule::in([PageBlock::APP_WEBSITE, PageBlock::APP_ORDER])],
            'page' => ['nullable', 'string', 'max:64'],
            'version' => ['nullable', 'integer', 'min:0'],
        ]);

        $app = (string) $payload['app'];
        $page = (string) ($payload['page'] ?? PageBlock::PAGE_HOME);
        $user = $this->staffUser($request);
        $draft = PageLayoutDraft::query()
            ->where('user_id', $user->id)
            ->where('app', $app)
            ->where('page', $page)
            ->first();

        if ($draft instanceof PageLayoutDraft) {
            $this->assertVersionMatches($draft, (int) ($payload['version'] ?? $draft->version));
            $blocks = $this->blocksFromDraft($draft);
        } else {
            if (array_key_exists('version', $payload) && (int) $payload['version'] !== 0) {
                return response()->json(['message' => 'Layout draft version conflict. Reload and try again.'], 409);
            }
            $blocks = $this->liveSnapshot($app, $page);
        }

        $token = ContentDraftStore::put($app, 'en', [
            'page_blocks' => [
                $app => [
                    $page => $blocks,
                ],
            ],
        ]);

        return response()->json([
            'token' => $token,
            'expires_in' => 900,
            'website_url' => URL::temporarySignedRoute(
                'content.preview.website',
                now()->addMinutes(15),
                ['token' => $token],
            ),
            'order_app_url' => rtrim((string) config('app.url'), '/') . '/order/?previewToken=' . urlencode($token),
            'draft' => $draft instanceof PageLayoutDraft,
        ]);
    }

    /** Publish the current user's draft into live page_blocks. */
    public function publish(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'app' => ['required', 'string', Rule::in([PageBlock::APP_WEBSITE, PageBlock::APP_ORDER])],
            'page' => ['nullable', 'string', 'max:64'],
            'version' => ['required', 'integer', 'min:1'],
        ]);

        $app = (string) $payload['app'];
        $page = (string) ($payload['page'] ?? PageBlock::PAGE_HOME);
        $user = $this->staffUser($request);

        DB::transaction(function () use ($request, $user, $payload, $app, $page): void {
            $draft = PageLayoutDraft::query()
                ->where('user_id', $user->id)
                ->where('app', $app)
                ->where('page', $page)
                ->lockForUpdate()
                ->first();

            if (! $draft instanceof PageLayoutDraft) {
                throw ValidationException::withMessages(['draft' => 'No draft exists for this page.']);
            }
            $this->assertVersionMatches($draft, (int) $payload['version']);

            $blocks = $this->blocksFromDraft($draft);
            $this->assertNoDuplicateSingletons($blocks);
            $this->assertNonRemovableBlocksPreserved($app, $page, $blocks);

            PageLayoutRevision::query()->create([
                'user_id' => $user->id,
                'app' => $app,
                'page' => $page,
                'version' => (int) $draft->version,
                'payload' => ['blocks' => $this->liveSnapshot($app, $page)],
                'is_draft' => false,
                'published_at' => now(),
            ]);

            PageBlock::query()
                ->where('app', $app)
                ->where('page', $page)
                ->lockForUpdate()
                ->get();

            PageBlock::query()
                ->where('app', $app)
                ->where('page', $page)
                ->delete();

            foreach ($this->normalizePositions($blocks) as $block) {
                $this->publishBlock($request, $app, $page, $block);
            }

            $draft->delete();
        });

        PageBlockRepository::bust($app, $page);
        PageBlockRepository::bust($this->otherApp($app), $page);

        return response()->json([
            'message' => 'Home layout published.',
            'app' => $app,
            'page' => $page,
            'draft' => false,
            'version' => 0,
            'blocks' => $this->liveSnapshot($app, $page),
        ]);
    }

    public function discard(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'app' => ['required', 'string', Rule::in([PageBlock::APP_WEBSITE, PageBlock::APP_ORDER])],
            'page' => ['nullable', 'string', 'max:64'],
        ]);

        $app = (string) $payload['app'];
        $page = (string) ($payload['page'] ?? PageBlock::PAGE_HOME);
        $user = $this->staffUser($request);

        PageLayoutDraft::query()
            ->where('user_id', $user->id)
            ->where('app', $app)
            ->where('page', $page)
            ->delete();

        return response()->json([
            'message' => 'Draft discarded.',
            'app' => $app,
            'page' => $page,
            'draft' => false,
            'version' => 0,
            'blocks' => $this->liveSnapshot($app, $page),
        ]);
    }

    /** @return array{0: PageLayoutDraft, 1: list<array<string, mixed>>} */
    private function draftForMutation(Request $request, string $app, string $page, int $expectedVersion): array
    {
        $user = $this->staffUser($request);
        $draft = PageLayoutDraft::query()
            ->where('user_id', $user->id)
            ->where('app', $app)
            ->where('page', $page)
            ->lockForUpdate()
            ->first();

        if ($draft instanceof PageLayoutDraft) {
            $this->assertVersionMatches($draft, $expectedVersion);

            return [$draft, $this->blocksFromDraft($draft)];
        }

        if ($expectedVersion !== 0) {
            abort(response()->json(['message' => 'Layout draft version conflict. Reload and try again.'], 409));
        }

        $draft = PageLayoutDraft::query()->create([
            'user_id' => $user->id,
            'app' => $app,
            'page' => $page,
            'version' => 0,
            'payload' => ['blocks' => $this->liveSnapshot($app, $page)],
        ]);

        return [$draft, $this->blocksFromDraft($draft)];
    }

    private function saveDraftPayload(PageLayoutDraft $draft, array $blocks): PageLayoutDraft
    {
        $draft->payload = ['blocks' => $this->serializeDraftBlocks($blocks)];
        $draft->version = ((int) $draft->version) + 1;
        $draft->save();

        return $draft->fresh();
    }

    /** @return list<array<string, mixed>> */
    private function liveSnapshot(string $app, string $page): array
    {
        return PageBlockRepository::forPage($app, $page, useCache: false)
            ->map(fn (PageBlock $block) => $this->serialize($block))
            ->values()
            ->all();
    }

    /** @return list<array<string, mixed>> */
    private function blocksFromDraft(PageLayoutDraft $draft): array
    {
        $payload = is_array($draft->payload) ? $draft->payload : [];
        $blocks = $payload['blocks'] ?? [];

        return is_array($blocks) ? $this->serializeDraftBlocks($blocks) : [];
    }

    /**
     * @param  list<array<string, mixed>>  $blocks
     * @return list<array<string, mixed>>
     */
    private function serializeDraftBlocks(array $blocks): array
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
            ];
        }

        usort($out, fn (array $a, array $b): int => ((int) $a['position']) <=> ((int) $b['position']));

        return array_values($out);
    }

    /** @return array<string, mixed> */
    private function serialize(PageBlock $block): array
    {
        $def = BlockTypeRegistry::get($block->block_type);
        $settings = $block->resolvedSettings();
        $media = GenericBlockPresenter::resolveMedia($block->block_type, $settings);
        $shared = $block->shared_content_id !== null
            ? ($block->relationLoaded('sharedContent') ? $block->sharedContent : $block->sharedContent()->first())
            : null;

        return [
            'id' => $block->id,
            'app' => $block->app,
            'page' => $block->page,
            'block_type' => $block->block_type,
            'position' => (int) $block->position,
            'is_enabled' => (bool) $block->is_enabled,
            'content_mode' => $block->content_mode,
            'shared_content_id' => $block->shared_content_id,
            'shared_content_uuid' => $shared instanceof PageBlockSharedContent ? $shared->uuid : null,
            'settings' => $settings,
            'media' => $media,
            'label' => $def?->label ?? $block->block_type,
            'description' => $def?->description ?? '',
            'removable' => $def?->removable ?? true,
            'non_removable_reason' => $def?->nonRemovableReason,
            'supports_shared_content' => $def?->supportsSharedContent ?? false,
            'allows_multiple' => $def?->allowsMultiple ?? false,
            'unknown' => $def === null,
        ];
    }

    /** @return array<string, mixed> */
    private function serializeType(BlockTypeDefinition $d): array
    {
        return [
            'type' => $d->type,
            'label' => $d->label,
            'description' => $d->description,
            'apps' => $d->apps,
            'removable' => $d->removable,
            'non_removable_reason' => $d->nonRemovableReason,
            'supports_shared_content' => $d->supportsSharedContent,
            'allows_multiple' => $d->allowsMultiple,
            'settings_schema' => $d->settingsSchema,
            'settings_defaults' => $d->settingsDefaults,
        ];
    }

    /** @return array<string, mixed> */
    private function draftRowFromData(array $data, int $id): array
    {
        $def = BlockTypeRegistry::get((string) $data['block_type']);

        return [
            'id' => $id,
            'app' => $data['app'],
            'page' => $data['page'],
            'block_type' => $data['block_type'],
            'position' => $data['position'],
            'is_enabled' => $data['is_enabled'],
            'content_mode' => $data['content_mode'],
            'shared_content_id' => null,
            'shared_content_uuid' => null,
            'settings' => $data['settings'],
            'media' => GenericBlockPresenter::resolveMedia((string) $data['block_type'], $data['settings']),
            'label' => $def?->label ?? $data['block_type'],
            'description' => $def?->description ?? '',
            'removable' => $def?->removable ?? true,
            'non_removable_reason' => $def?->nonRemovableReason,
            'supports_shared_content' => $def?->supportsSharedContent ?? false,
            'allows_multiple' => $def?->allowsMultiple ?? false,
            'unknown' => $def === null,
        ];
    }

    private function publishBlock(Request $request, string $app, string $page, array $block): PageBlock
    {
        $type = (string) $block['block_type'];
        $settings = is_array($block['settings'] ?? null) ? $block['settings'] : [];
        $mode = (string) ($block['content_mode'] ?? PageBlock::MODE_SHARED);
        $sharedContentId = null;

        if ($mode === PageBlock::MODE_SHARED && GenericBlockPresenter::isGeneric($type)) {
            $shared = $this->sharedContentForPublish($block, $type, $settings);
            $sharedContentId = $shared->id;
            $settings = [];
        }

        if ($mode === PageBlock::MODE_SHARED && ! GenericBlockPresenter::isGeneric($type) && isset($block['share_source'])) {
            $this->publishNamedSharedContent($request, $type, (string) $block['share_source']);
        }

        $data = PageBlockValidator::validateInstance([
            'app' => $app,
            'page' => $page,
            'block_type' => $type,
            'position' => $block['position'],
            'is_enabled' => $block['is_enabled'],
            'content_mode' => $mode,
            'settings' => $settings,
        ]);

        $created = PageBlock::query()->create([
            ...$data,
            'shared_content_id' => $sharedContentId,
        ]);

        if ($sharedContentId !== null) {
            $this->ensureSharedCounterpart($created, $sharedContentId);
        }

        return $created;
    }

    private function sharedContentForPublish(array $block, string $type, array $settings): PageBlockSharedContent
    {
        $shared = null;
        if (! empty($block['shared_content_id'])) {
            $shared = PageBlockSharedContent::query()
                ->where('id', (int) $block['shared_content_id'])
                ->lockForUpdate()
                ->first();
        }
        if (! $shared instanceof PageBlockSharedContent && ! empty($block['shared_content_uuid'])) {
            $shared = PageBlockSharedContent::query()
                ->where('uuid', (string) $block['shared_content_uuid'])
                ->lockForUpdate()
                ->first();
        }

        if (! $shared instanceof PageBlockSharedContent) {
            $shared = new PageBlockSharedContent([
                'uuid' => (string) ($block['shared_content_uuid'] ?? Str::uuid()),
                'block_type' => $type,
            ]);
        }

        $shared->block_type = $type;
        $shared->settings = GenericBlockPresenter::sanitizeSettings($type, $settings);
        $shared->save();

        return $shared;
    }

    private function ensureSharedCounterpart(PageBlock $block, int $sharedContentId): void
    {
        $otherApp = $this->otherApp($block->app);
        $def = BlockTypeRegistry::get($block->block_type);
        if ($def === null || ! $def->allowsApp($otherApp)) {
            return;
        }

        $exists = PageBlock::query()
            ->where('app', $otherApp)
            ->where('page', $block->page)
            ->where('shared_content_id', $sharedContentId)
            ->exists();
        if ($exists) {
            return;
        }

        $position = ((int) PageBlock::query()
            ->where('app', $otherApp)
            ->where('page', $block->page)
            ->max('position')) + 1;

        PageBlock::query()->create([
            'app' => $otherApp,
            'page' => $block->page,
            'block_type' => $block->block_type,
            'position' => $position,
            'is_enabled' => true,
            'content_mode' => PageBlock::MODE_SHARED,
            'shared_content_id' => $sharedContentId,
            'settings' => [],
        ]);
    }

    private function publishNamedSharedContent(Request $request, string $type, string $source): void
    {
        foreach ($this->namedSharedKeys($type) as $key) {
            $value = $source === 'shared'
                ? ContentResolver::for(PageBlock::APP_WEBSITE)->get($key)
                : ContentResolver::for($source)->get($key);
            if ($value === null) {
                continue;
            }
            $writtenValue = is_scalar($value)
                ? (string) $value
                : (json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '');
            $this->writer->write(
                $key,
                'shared',
                $writtenValue,
                'en',
                $request,
                'content.page_block_shared',
                ['block_type' => $type, 'source' => $source],
            );
        }
    }

    /** @return list<string> */
    private function namedSharedKeys(string $type): array
    {
        return match ($type) {
            'hero', 'promo_carousel' => ['hero_slides'],
            'specials' => ['offers_headline', 'offers_subtext'],
            'categories' => ['homepage_categories', 'home_categories_eyebrow', 'home_categories_title'],
            'brand_footer' => ['footer_text', 'footer_thanks', 'home_chat_label'],
            default => [],
        };
    }

    /** @return array<string, mixed> */
    private function sourceSettingsForGeneric(array $block, string $source): array
    {
        if ($source === 'shared') {
            return $this->resolvedSettingsForDraftBlock($block);
        }

        if (($block['app'] ?? null) === $source) {
            return is_array($block['settings'] ?? null) ? $block['settings'] : [];
        }

        $candidate = PageBlock::query()
            ->where('app', $source)
            ->where('page', (string) ($block['page'] ?? PageBlock::PAGE_HOME))
            ->where('block_type', (string) $block['block_type'])
            ->where('content_mode', PageBlock::MODE_SHARED)
            ->whereNotNull('shared_content_id')
            ->orderBy('position')
            ->first();

        return $candidate instanceof PageBlock ? $candidate->resolvedSettings() : $this->resolvedSettingsForDraftBlock($block);
    }

    /** @return array<string, mixed> */
    private function resolvedSettingsForDraftBlock(array $block): array
    {
        if (! empty($block['shared_content_id'])) {
            $shared = PageBlockSharedContent::query()->find((int) $block['shared_content_id']);
            if ($shared instanceof PageBlockSharedContent && is_array($shared->settings)) {
                return $shared->settings;
            }
        }

        return is_array($block['settings'] ?? null) ? $block['settings'] : [];
    }

    /** @param list<array<string, mixed>> $blocks */
    private function assertSingletonAvailable(array $blocks, string $type): void
    {
        if (BlockTypeRegistry::allowsMultiple($type)) {
            return;
        }

        if (collect($blocks)->contains(fn (array $block): bool => ($block['block_type'] ?? null) === $type)) {
            $def = BlockTypeRegistry::get($type);
            throw ValidationException::withMessages([
                'block_type' => ($def?->label ?? $type).' already exists on this home page.',
            ]);
        }
    }

    /** @param list<array<string, mixed>> $blocks */
    private function assertNoDuplicateSingletons(array $blocks): void
    {
        $seen = [];
        foreach ($blocks as $block) {
            $type = (string) ($block['block_type'] ?? '');
            if ($type === '' || BlockTypeRegistry::allowsMultiple($type)) {
                continue;
            }
            if (isset($seen[$type])) {
                throw ValidationException::withMessages(['blocks' => "{$type} can only appear once on this page."]);
            }
            $seen[$type] = true;
        }
    }

    /** @param list<array<string, mixed>> $blocks */
    private function assertNonRemovableBlocksPreserved(string $app, string $page, array $blocks): void
    {
        $nextTypes = collect($blocks)->pluck('block_type')->all();
        $missing = PageBlock::query()
            ->where('app', $app)
            ->where('page', $page)
            ->get(['block_type'])
            ->filter(fn (PageBlock $block): bool => ! BlockTypeRegistry::isRemovable($block->block_type))
            ->filter(fn (PageBlock $block): bool => ! in_array($block->block_type, $nextTypes, true))
            ->first();

        if ($missing instanceof PageBlock) {
            $def = BlockTypeRegistry::get($missing->block_type);
            throw ValidationException::withMessages([
                'blocks' => $def?->nonRemovableReason ?? "{$missing->block_type} cannot be removed.",
            ]);
        }
    }

    /**
     * @param  list<array<string, mixed>>  $blocks
     * @return list<array<string, mixed>>
     */
    private function normalizePositions(array $blocks): array
    {
        usort($blocks, fn (array $a, array $b): int => ((int) ($a['position'] ?? 0)) <=> ((int) ($b['position'] ?? 0)));

        return array_values(array_map(function (array $block, int $i): array {
            $block['position'] = $i;

            return $block;
        }, $blocks, array_keys($blocks)));
    }

    /** @param list<array<string, mixed>> $blocks */
    private function nextDraftId(array $blocks): int
    {
        $min = collect($blocks)->pluck('id')->map(fn ($id) => (int) $id)->min();

        return $min !== null && $min < 0 ? $min - 1 : -1;
    }

    /** @param list<array<string, mixed>> $blocks */
    private function findDraftBlockIndex(array $blocks, int $id): int
    {
        foreach ($blocks as $i => $block) {
            if ((int) ($block['id'] ?? 0) === $id) {
                return $i;
            }
        }

        throw ValidationException::withMessages(['block' => 'Block not found in this draft.']);
    }

    /** @param array<string, mixed> $payload */
    private function appPageForBlockRequest(int $id, array $payload): array
    {
        $app = isset($payload['app']) ? (string) $payload['app'] : null;
        $page = isset($payload['page']) ? (string) $payload['page'] : null;
        if ($app !== null && $page !== null) {
            return [$app, $page];
        }

        if ($id > 0) {
            $block = PageBlock::query()->find($id);
            if ($block instanceof PageBlock) {
                return [$app ?? $block->app, $page ?? $block->page];
            }
        }

        throw ValidationException::withMessages([
            'app' => 'App and page are required for draft-only blocks.',
        ]);
    }

    private function assertVersionMatches(PageLayoutDraft $draft, int $expectedVersion): void
    {
        if ((int) $draft->version !== $expectedVersion) {
            abort(response()->json(['message' => 'Layout draft version conflict. Reload and try again.'], 409));
        }
    }

    private function assertNoOtherDraft(Request $request, string $app, string $page): void
    {
        $user = $this->staffUser($request);
        $other = PageLayoutDraft::query()
            ->where('app', $app)
            ->where('page', $page)
            ->where('user_id', '!=', $user->id)
            ->exists();

        if ($other) {
            abort(response()->json([
                'message' => 'Another staff user has an unpublished draft for this page. Ask them to publish or discard it before editing.',
            ], 409));
        }
    }

    private function staffUser(Request $request): User
    {
        $user = $request->user();
        if (! $user instanceof User) {
            abort(response()->json(['message' => 'Unauthenticated.'], 401));
        }

        return $user;
    }

    private function assertApp(string $app): void
    {
        if (! in_array($app, [PageBlock::APP_WEBSITE, PageBlock::APP_ORDER], true)) {
            throw ValidationException::withMessages(['app' => 'App must be website or order_app.']);
        }
    }

    private function otherApp(string $app): string
    {
        return $app === PageBlock::APP_WEBSITE ? PageBlock::APP_ORDER : PageBlock::APP_WEBSITE;
    }
}
