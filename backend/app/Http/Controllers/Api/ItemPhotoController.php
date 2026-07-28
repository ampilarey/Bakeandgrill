<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Media\Services\VideoProcessor;
use App\Http\Requests\StoreItemVideoRequest;
use App\Models\Item;
use App\Models\ItemPhoto;
use App\Services\MenuImageProcessor;
use App\Support\ImageCapabilities;
use App\Support\MenuImageValidation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class ItemPhotoController extends Controller
{
    public function __construct(
        private readonly MenuImageProcessor $processor,
        private readonly VideoProcessor $videos,
    ) {}

    public function index(int $itemId): JsonResponse
    {
        $item = Item::findOrFail($itemId);
        $photos = $item->photos()->get();

        return response()->json(['photos' => $photos]);
    }

    public function store(Request $request, int $itemId): JsonResponse
    {
        if ($request->input('media_type') === 'video') {
            return $this->storeVideo($request, $itemId);
        }

        $item = Item::findOrFail($itemId);

        if (MenuImageValidation::looksLikeHeic($request->file('photo'))) {
            throw ValidationException::withMessages([
                'photo' => [MenuImageValidation::heicRejectedMessage()],
            ]);
        }

        try {
            $validated = $request->validate([
                'photo' => MenuImageValidation::fileRules(required: true),
                'original' => MenuImageValidation::fileRules(required: false),
                'alt_text' => ['nullable', 'string', 'max:200'],
                'is_primary' => ['sometimes', 'boolean'],
                // When re-cropping, keep the existing master without re-uploading it.
                'original_url' => ['sometimes', 'nullable', 'string', 'max:500'],
            ]);
        } catch (ValidationException $e) {
            if (MenuImageValidation::looksLikeHeic($request->file('photo'))) {
                throw ValidationException::withMessages([
                    'photo' => [MenuImageValidation::heicRejectedMessage()],
                ]);
            }
            if (!ImageCapabilities::supportsWebp()) {
                $file = $request->file('photo');
                if ($file && str_contains(strtolower((string) $file->getMimeType()), 'webp')) {
                    throw ValidationException::withMessages([
                        'photo' => [MenuImageValidation::webpUnsupportedMessage()],
                    ]);
                }
            }
            throw $e;
        }

        try {
            $path = $this->processor->storeProcessed(
                $request->file('photo'),
                "item-photos/{$itemId}",
            );
            $thumbPath = $this->processor->storeThumbnail(
                $request->file('photo'),
                "item-photos/{$itemId}/thumbs",
            );
            $originalUrl = null;
            if ($request->hasFile('original')) {
                $origPath = $this->processor->storeMaster(
                    $request->file('original'),
                    "item-photos/{$itemId}/masters",
                );
                $originalUrl = '/storage/' . ltrim($origPath, '/');
            } elseif (!empty($validated['original_url'])) {
                $originalUrl = $validated['original_url'];
            }
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $url = '/storage/' . ltrim($path, '/');
        $thumbUrl = '/storage/' . ltrim($thumbPath, '/');

        if ($validated['is_primary'] ?? false) {
            $item->photos()->update(['is_primary' => false]);
        }

        $maxOrder = $item->photos()->max('sort_order') ?? 0;

        $photo = ItemPhoto::create([
            'item_id' => $item->id,
            'url' => $url,
            'original_url' => $originalUrl,
            'thumb_url' => $thumbUrl,
            'alt_text' => $validated['alt_text'] ?? null,
            'sort_order' => $maxOrder + 1,
            'is_primary' => (bool) ($validated['is_primary'] ?? false),
            'media_type' => 'image',
        ]);

        return response()->json(['photo' => $photo], 201);
    }

    /**
     * Gallery video clip — store + normalise to web-safe H.264 mp4, with poster.
     */
    private function storeVideo(Request $request, int $itemId): JsonResponse
    {
        $item = Item::findOrFail($itemId);
        $form = new StoreItemVideoRequest;
        $validated = $request->validate($form->rules(), $form->messages());

        $video = $request->file('video');
        $poster = $request->file('poster');
        $allowedVideo = config('menu_media.video.mimetypes', ['video/mp4', 'video/webm']);
        if (!in_array((string) $video->getMimeType(), $allowedVideo, true)) {
            return response()->json(['message' => 'Video must be MP4, WebM, or MOV.'], 422);
        }

        try {
            $ext = strtolower((string) $video->getClientOriginalExtension()) ?: 'mp4';
            if (!in_array($ext, config('menu_media.video.extensions', ['mp4', 'webm', 'mov']), true)) {
                $mime = (string) $video->getMimeType();
                $ext = match (true) {
                    str_contains($mime, 'webm') => 'webm',
                    str_contains($mime, 'quicktime') => 'mov',
                    default => 'mp4',
                };
            }
            $videoRel = $this->processor->storeRaw(
                $video,
                "item-photos/{$itemId}/video",
                $ext,
            );
            $safe = $this->videos->ensureWebSafe(Storage::disk('public')->path($videoRel));
            $videoRel = $safe['relative_path'];
            $posterRel = $this->processor->storeProcessed($poster, "item-photos/{$itemId}/posters");
            $thumbRel = $this->processor->storeThumbnail($poster, "item-photos/{$itemId}/thumbs");
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        if ($validated['is_primary'] ?? false) {
            $item->photos()->update(['is_primary' => false]);
        }

        $maxOrder = $item->photos()->max('sort_order') ?? 0;

        $photo = ItemPhoto::create([
            'item_id' => $item->id,
            'url' => '/storage/' . ltrim($videoRel, '/'),
            'original_url' => null,
            'thumb_url' => '/storage/' . ltrim($thumbRel, '/'),
            'poster_url' => '/storage/' . ltrim($posterRel, '/'),
            'media_type' => 'video',
            'alt_text' => $validated['alt_text'] ?? null,
            'sort_order' => $maxOrder + 1,
            'is_primary' => (bool) ($validated['is_primary'] ?? false),
        ]);

        return response()->json(['photo' => $photo], 201);
    }

    public function update(Request $request, int $itemId, int $photoId): JsonResponse
    {
        $photo = ItemPhoto::where('item_id', $itemId)->findOrFail($photoId);
        $validated = $request->validate([
            'alt_text' => ['nullable', 'string', 'max:200'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
            'is_primary' => ['sometimes', 'boolean'],
            // Allow clearing before destroy so a reused master file is not deleted.
            'original_url' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);

        if (!empty($validated['is_primary'])) {
            ItemPhoto::where('item_id', $itemId)->update(['is_primary' => false]);
        }

        $photo->update($validated);

        return response()->json(['photo' => $photo->fresh()]);
    }

    /**
     * Atomically set contiguous sort_order from an ordered list of photo IDs.
     * POST /api/items/{itemId}/photos/reorder  body: { order: number[] }
     */
    public function reorder(Request $request, int $itemId): JsonResponse
    {
        $item = Item::findOrFail($itemId);
        $validated = $request->validate([
            'order' => ['required', 'array', 'min:1'],
            'order.*' => ['integer', 'distinct'],
        ]);

        /** @var list<int> $order */
        $order = array_map('intval', $validated['order']);
        $photos = $item->photos()->get()->keyBy('id');

        if ($photos->count() !== count($order)) {
            return response()->json([
                'message' => 'Order must include every photo for this item exactly once.',
            ], 422);
        }

        foreach ($order as $photoId) {
            if (!$photos->has($photoId)) {
                return response()->json([
                    'message' => 'One or more photo IDs do not belong to this item.',
                ], 422);
            }
        }

        \Illuminate\Support\Facades\DB::transaction(function () use ($order, $photos): void {
            foreach ($order as $index => $photoId) {
                $photos->get($photoId)->update(['sort_order' => $index + 1]);
            }
        });

        return response()->json([
            'photos' => $item->photos()->orderBy('sort_order')->get(),
        ]);
    }

    public function destroy(int $itemId, int $photoId): JsonResponse
    {
        $photo = ItemPhoto::where('item_id', $itemId)->findOrFail($photoId);
        // Disk cleanup is handled by ItemPhotoObserver via MediaFileCleaner.
        $photo->delete();

        return response()->json(['message' => 'Photo deleted.']);
    }
}
