<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Permissions\Services\PermissionService;
use App\Domains\Social\Jobs\RenderSocialVideoJob;
use App\Domains\Social\Services\SocialVideoRenderer;
use App\Models\Item;
use App\Models\SocialVideoRendition;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;

/**
 * Social video renditions (plan, video section). Listing needs social.view;
 * generating/deleting checks social.compose in-method. Renders queue on the
 * dedicated `social` queue; TikTok stays download-and-upload-manually.
 */
class SocialVideoController extends Controller
{
    public function __construct(private readonly SocialVideoRenderer $renderer) {}

    /** GET /admin/social/items/{id}/videos */
    public function index(int $id): JsonResponse
    {
        $item = Item::with('photos')->findOrFail($id);
        $fingerprint = $this->renderer->available() ? $this->renderer->fingerprint($item) : null;

        return response()->json([
            'renderer_available' => $this->renderer->available(),
            'has_photos' => $this->renderer->sourcePhotoPaths($item) !== [],
            'formats' => array_keys(SocialVideoRendition::FORMATS),
            'renditions' => SocialVideoRendition::query()
                ->where('item_id', $item->id)
                ->orderBy('format')
                ->get()
                ->map(fn (SocialVideoRendition $r) => $this->payload($r, $fingerprint))
                ->values(),
        ]);
    }

    /** POST /admin/social/items/{id}/videos — queue (or refresh) one format. */
    public function store(Request $request, int $id): JsonResponse
    {
        $this->requirePermission($request, 'social.compose');

        $data = $request->validate([
            'format' => ['required', Rule::in(array_keys(SocialVideoRendition::FORMATS))],
        ]);

        if (!$this->renderer->available()) {
            return response()->json([
                'message' => 'Video rendering is not available on this server (ffmpeg missing). '
                    . 'Run social:video-benchmark on the host first.',
            ], 422);
        }

        $item = Item::with('photos')->findOrFail($id);
        if ($this->renderer->sourcePhotoPaths($item) === []) {
            return response()->json([
                'message' => 'This item has no usable photos — videos are only built from real item photos.',
            ], 422);
        }

        $fingerprint = $this->renderer->fingerprint($item);
        $rendition = SocialVideoRendition::query()->firstOrNew([
            'item_id' => $item->id,
            'format' => $data['format'],
        ]);

        if ($rendition->exists
            && $rendition->status === SocialVideoRendition::STATUS_READY
            && $rendition->source_fingerprint === $fingerprint) {
            // Current render already matches the source — nothing to do.
            return response()->json(['rendition' => $this->payload($rendition, $fingerprint)]);
        }
        if ($rendition->exists && $rendition->status === SocialVideoRendition::STATUS_PROCESSING) {
            return response()->json(['rendition' => $this->payload($rendition, $fingerprint)], 202);
        }

        $rendition->fill([
            'status' => SocialVideoRendition::STATUS_QUEUED,
            'source_fingerprint' => $fingerprint,
            'error_message' => null,
        ])->save();
        RenderSocialVideoJob::dispatch($rendition->id);

        return response()->json(['rendition' => $this->payload($rendition->fresh(), $fingerprint)], 202);
    }

    /** DELETE /admin/social/videos/{renditionId} */
    public function destroy(Request $request, int $renditionId): JsonResponse
    {
        $this->requirePermission($request, 'social.compose');

        $rendition = SocialVideoRendition::findOrFail($renditionId);
        $rendition->deleteFiles();
        $rendition->delete();

        return response()->json(['ok' => true]);
    }

    private function requirePermission(Request $request, string $slug): void
    {
        $user = $request->user();
        if (!$user instanceof \App\Models\User
            || !app(PermissionService::class)->hasPermission($user, $slug)) {
            abort(403, "Missing permission: {$slug}");
        }
    }

    /** @return array<string, mixed> */
    private function payload(SocialVideoRendition $r, ?string $currentFingerprint): array
    {
        return [
            'id' => $r->id,
            'item_id' => $r->item_id,
            'format' => $r->format,
            'status' => $r->status,
            'width' => $r->width,
            'height' => $r->height,
            'bytes' => $r->bytes,
            'url' => $r->url(),
            'poster_url' => $r->posterUrl(),
            'error_message' => $r->error_message,
            // Source photos / name / price changed since this was rendered.
            'stale' => $currentFingerprint !== null
                && $r->status === SocialVideoRendition::STATUS_READY
                && $r->source_fingerprint !== $currentFingerprint,
            'updated_at' => $r->updated_at?->toIso8601String(),
        ];
    }
}
