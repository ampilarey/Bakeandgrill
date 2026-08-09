<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Content\Blocks\BlockTypeRegistry;
use App\Domains\Content\Blocks\PageBlockRepository;
use App\Domains\Content\Blocks\PageBlockValidator;
use App\Domains\Content\ContentDraftStore;
use App\Domains\Content\ContentResolver;
use App\Http\Controllers\Controller;
use App\Models\PageBlock;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PageBlockController extends Controller
{
    /** Admin: list blocks + available types for an app. */
    public function index(Request $request): JsonResponse
    {
        $app = (string) $request->query('app', PageBlock::APP_WEBSITE);
        $page = (string) $request->query('page', PageBlock::PAGE_HOME);
        $this->assertApp($app);

        $blocks = PageBlockRepository::forPage($app, $page, useCache: false);
        $unknown = BlockTypeRegistry::unknownTypesAmong($blocks->pluck('block_type'));

        return response()->json([
            'app' => $app,
            'page' => $page,
            'blocks' => $blocks->map(fn (PageBlock $b) => $this->serialize($b))->values(),
            'available_types' => array_map(
                fn ($d) => $this->serializeType($d),
                BlockTypeRegistry::forApp($app),
            ),
            'unknown_types' => $unknown,
        ]);
    }

    /** Public: enabled blocks for rendering (one query). */
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
                    'blocks' => $overrides,
                    'preview' => true,
                ]);
            }
        }

        $blocks = PageBlockRepository::forPage($app, $page)
            ->filter(fn (PageBlock $b) => $b->is_enabled)
            ->filter(fn (PageBlock $b) => BlockTypeRegistry::isKnown($b->block_type))
            ->values();

        return response()->json([
            'app' => $app,
            'page' => $page,
            'blocks' => $blocks->map(fn (PageBlock $b) => $this->serialize($b))->values(),
            'preview' => false,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = PageBlockValidator::validateInstance([
            ...$request->all(),
            'page' => $request->input('page', PageBlock::PAGE_HOME),
        ]);

        // Append only when no position was sent — an explicit 0 means "first".
        if ($request->input('position') === null) {
            $max = (int) PageBlock::query()
                ->where('app', $data['app'])
                ->where('page', $data['page'])
                ->max('position');
            $data['position'] = $max + 1;
        }

        $block = PageBlock::create($data);
        PageBlockRepository::bust($data['app'], $data['page']);

        return response()->json(['block' => $this->serialize($block)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $block = PageBlock::query()->findOrFail($id);

        // Merge the request over the block's existing values: a partial PUT
        // may only change the fields it actually contains. Without this the
        // validator defaults (position 0, enabled, empty settings) would
        // overwrite stored values on every partial update.
        $payload = [
            'app' => $block->app,
            'page' => $block->page,
            'block_type' => $request->input('block_type') ?? $block->block_type,
            'position' => $request->input('position') ?? (int) $block->position,
            'is_enabled' => $request->input('is_enabled') ?? (bool) $block->is_enabled,
            'content_mode' => $request->input('content_mode') ?? $block->content_mode,
            'settings' => $request->input('settings') ?? ($block->settings ?? []),
        ];

        // shared → own: copy current shared content snapshot into settings.
        $requestedMode = $request->input('content_mode');
        if ($requestedMode === PageBlock::MODE_OWN && $block->content_mode === PageBlock::MODE_SHARED) {
            $copied = $this->copySharedContentIntoSettings($block);
            $payload['settings'] = array_merge($copied, is_array($request->input('settings')) ? $request->input('settings') : []);
        }

        $data = PageBlockValidator::validateInstance($payload, $block->block_type);
        $block->update([
            'position' => $data['position'],
            'is_enabled' => $data['is_enabled'],
            'content_mode' => $data['content_mode'],
            'settings' => $data['settings'],
        ]);
        PageBlockRepository::bust($block->app, $block->page);

        return response()->json(['block' => $this->serialize($block->fresh())]);
    }

    public function destroy(int $id): JsonResponse
    {
        $block = PageBlock::query()->findOrFail($id);
        PageBlockValidator::assertCanDelete($block->block_type);
        $app = $block->app;
        $page = $block->page;
        $block->delete();
        PageBlockRepository::bust($app, $page);

        return response()->json(['message' => 'Block removed.']);
    }

    /** Replace full ordered list for an app+page (reorder / bulk toggle). */
    public function reorder(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'app' => 'required|string|in:website,order_app',
            'page' => 'nullable|string|max:64',
            'blocks' => 'required|array|min:1',
            'blocks.*.id' => 'required|integer',
            'blocks.*.position' => 'required|integer|min:0',
            'blocks.*.is_enabled' => 'required|boolean',
        ]);

        $app = $validated['app'];
        $page = $validated['page'] ?? PageBlock::PAGE_HOME;

        // A partial list would leave the omitted blocks at stale positions
        // that can collide with the new ones — require the full page.
        $sentIds = collect($validated['blocks'])->pluck('id')->map(fn ($v) => (int) $v);
        $missing = PageBlock::query()
            ->where('app', $app)
            ->where('page', $page)
            ->pluck('id')
            ->diff($sentIds);
        if ($missing->isNotEmpty()) {
            throw ValidationException::withMessages([
                'blocks' => 'Reorder must include every block on this page — missing block id(s): '
                    .$missing->implode(', ').'. Reload the layout editor and try again.',
            ]);
        }

        DB::transaction(function () use ($validated, $app, $page) {
            foreach ($validated['blocks'] as $row) {
                $block = PageBlock::query()
                    ->where('app', $app)
                    ->where('page', $page)
                    ->where('id', $row['id'])
                    ->lockForUpdate()
                    ->firstOrFail();

                if ($row['is_enabled'] === false && ! BlockTypeRegistry::isRemovable($block->block_type)) {
                    $def = BlockTypeRegistry::get($block->block_type);
                    throw ValidationException::withMessages([
                        'blocks' => $def?->nonRemovableReason
                            ?? "“{$block->block_type}” cannot be turned off.",
                    ]);
                }

                $block->update([
                    'position' => (int) $row['position'],
                    'is_enabled' => (bool) $row['is_enabled'],
                ]);
            }
        });

        PageBlockRepository::bust($app, $page);

        return $this->index(new Request(['app' => $app, 'page' => $page]));
    }

    /** Publish a draft layout preview token (does not change public page). */
    public function previewToken(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'app' => 'required|string|in:website,order_app',
            'page' => 'nullable|string|max:64',
            'blocks' => 'required|array',
        ]);
        $app = $validated['app'];
        $page = $validated['page'] ?? PageBlock::PAGE_HOME;

        $token = ContentDraftStore::put($app, 'en', [
            'page_blocks' => [
                $app => [
                    $page => $validated['blocks'],
                ],
            ],
        ]);

        return response()->json([
            'token' => $token,
            'expires_in' => 900,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function copySharedContentIntoSettings(PageBlock $block): array
    {
        $settings = is_array($block->settings) ? $block->settings : [];
        $resolver = ContentResolver::for($block->app);

        // Snapshot a few well-known shared keys related to the block type.
        $keys = match ($block->block_type) {
            'hero', 'promo_carousel' => ['hero_slides'],
            'specials' => ['offers_headline', 'offers_subtext'],
            'categories' => ['homepage_categories', 'home_categories_eyebrow', 'home_categories_title'],
            'brand_footer' => ['footer_text', 'footer_thanks', 'home_chat_label'],
            default => [],
        };

        $copied = [];
        foreach ($keys as $key) {
            $copied[$key] = $resolver->get($key);
        }

        return array_merge($settings, ['_copied_from_shared' => $copied]);
    }

    private function assertApp(string $app): void
    {
        if (! in_array($app, ['website', 'order_app'], true)) {
            throw ValidationException::withMessages(['app' => 'App must be website or order_app.']);
        }
    }

    /** @return array<string, mixed> */
    private function serialize(PageBlock $block): array
    {
        $def = BlockTypeRegistry::get($block->block_type);

        return [
            'id' => $block->id,
            'app' => $block->app,
            'page' => $block->page,
            'block_type' => $block->block_type,
            'position' => (int) $block->position,
            'is_enabled' => (bool) $block->is_enabled,
            'content_mode' => $block->content_mode,
            'settings' => $block->settings ?? [],
            'label' => $def?->label ?? $block->block_type,
            'description' => $def?->description ?? '',
            'removable' => $def?->removable ?? true,
            'non_removable_reason' => $def?->nonRemovableReason,
            'supports_shared_content' => $def?->supportsSharedContent ?? false,
            'unknown' => $def === null,
        ];
    }

    /** @return array<string, mixed> */
    private function serializeType(\App\Domains\Content\Blocks\BlockTypeDefinition $d): array
    {
        return [
            'type' => $d->type,
            'label' => $d->label,
            'description' => $d->description,
            'apps' => $d->apps,
            'removable' => $d->removable,
            'non_removable_reason' => $d->nonRemovableReason,
            'supports_shared_content' => $d->supportsSharedContent,
        ];
    }
}
