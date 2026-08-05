<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Rules\MediaUrl;
use App\Services\MenuImageProcessor;
use App\Support\ImageCapabilities;
use App\Support\MediaFileCleaner;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
    public function __construct(
        private readonly MenuImageProcessor $processor,
    ) {}

    /**
     * Display all categories with items
     */
    public function index(Request $request)
    {
        // ?admin=1 only honoured for authenticated staff — never for guests/customers
        $isAdmin = (bool) $request->query('admin')
                   && $request->user() instanceof \App\Models\User
                   && $request->user()->tokenCan('staff');

        // POS only needs category pills — skip nesting every item here
        // (items are loaded via GET /items with channel filtering).
        $withItems = !in_array($request->query('with_items'), ['0', 'false', 'no'], true);

        $query = Category::query();

        if ($withItems) {
            $query->with(['items' => function ($q) use ($isAdmin) {
                if (!$isAdmin) {
                    $q->where('is_active', true)->where('is_available', true);
                }
                $q->orderBy('sort_order')->orderBy('name');
            }]);
        }

        if (!$isAdmin) {
            $query->where('is_active', true);
        }

        $categories = $query->orderBy('sort_order')->orderBy('name')->get();

        return response()->json(['data' => $categories]);
    }

    /**
     * Store a new category
     */
    public function store(Request $request)
    {
        $data = $request->only([
            'name', 'name_dv', 'description', 'sort_order', 'is_active',
            'image_url', 'image_original_url', 'thumb_url', 'image_webp_url', 'thumb_webp_url', 'parent_id',
        ]);
        foreach (['image_url', 'image_original_url', 'thumb_url', 'image_webp_url', 'thumb_webp_url'] as $field) {
            if (array_key_exists($field, $data) && $data[$field] === '') {
                $data[$field] = null;
            }
        }
        $validated = validator($data, [
            'name' => 'required|string|max:255',
            'name_dv' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'sort_order' => 'nullable|integer',
            'is_active' => 'nullable|boolean',
            'image_url' => ['nullable', 'string', 'max:2048', new MediaUrl],
            'image_original_url' => ['nullable', 'string', 'max:2048', new MediaUrl],
            'thumb_url' => ['nullable', 'string', 'max:2048', new MediaUrl],
            'image_webp_url' => ['nullable', 'string', 'max:2048', new MediaUrl],
            'thumb_webp_url' => ['nullable', 'string', 'max:2048', new MediaUrl],
            'parent_id' => 'nullable|integer|exists:categories,id',
        ])->validate();

        if (array_key_exists('sort_order', $validated) && $validated['sort_order'] === null) {
            unset($validated['sort_order']);
        }
        if (array_key_exists('parent_id', $validated) && $validated['parent_id'] === null) {
            $validated['parent_id'] = null;
        }

        $validated = $this->ensureCategoryThumb($validated);

        $category = Category::create($validated);

        return response()->json([
            'message' => 'Category created successfully',
            'category' => $category,
        ], 201);
    }

    /**
     * Display a specific category
     */
    public function show($id)
    {
        $category = Category::with(['items' => function ($q) {
            $q->where('is_active', true)
                ->orderBy('sort_order')
                ->orderBy('name');
        }])->findOrFail($id);

        return response()->json(['category' => $category]);
    }

    /**
     * Update a category
     */
    public function update(Request $request, $id)
    {
        $data = $request->only([
            'name', 'name_dv', 'description', 'sort_order', 'is_active',
            'image_url', 'image_original_url', 'thumb_url', 'image_webp_url', 'thumb_webp_url', 'parent_id',
        ]);
        foreach (['image_url', 'image_original_url', 'thumb_url', 'image_webp_url', 'thumb_webp_url'] as $field) {
            if (array_key_exists($field, $data) && $data[$field] === '') {
                $data[$field] = null;
            }
        }
        $validated = validator($data, [
            'name' => 'sometimes|string|max:255',
            'name_dv' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'sort_order' => 'nullable|integer',
            'is_active' => 'sometimes|boolean',
            'image_url' => ['nullable', 'string', 'max:2048', new MediaUrl],
            'image_original_url' => ['nullable', 'string', 'max:2048', new MediaUrl],
            'thumb_url' => ['nullable', 'string', 'max:2048', new MediaUrl],
            'image_webp_url' => ['nullable', 'string', 'max:2048', new MediaUrl],
            'thumb_webp_url' => ['nullable', 'string', 'max:2048', new MediaUrl],
            'parent_id' => 'nullable|integer|exists:categories,id',
        ])->validate();

        if (array_key_exists('sort_order', $validated) && $validated['sort_order'] === null) {
            unset($validated['sort_order']);
        }

        $category = Category::findOrFail($id);

        // Prevent circular reference: a category cannot be its own parent or descendant.
        if (!empty($validated['parent_id'])) {
            if ($validated['parent_id'] === (int) $id) {
                return response()->json(['message' => 'A category cannot be its own parent.'], 422);
            }
            $parent = Category::find($validated['parent_id']);
            if ($parent && $parent->parent_id === (int) $id) {
                return response()->json(['message' => 'Circular subcategory reference detected.'], 422);
            }
        }

        $oldImageUrl = $category->image_url;
        $oldOriginalUrl = $category->image_original_url;
        $oldThumbUrl = $category->thumb_url;
        $oldImageWebpUrl = $category->getAttribute('image_webp_url');
        $oldThumbWebpUrl = $category->getAttribute('thumb_webp_url');

        $validated = $this->ensureCategoryThumb($validated, $category);

        $category->update($validated);

        $keep = array_values(array_filter([
            $category->image_url,
            $category->image_original_url,
            $category->thumb_url,
            $category->getAttribute('image_webp_url'),
            $category->getAttribute('thumb_webp_url'),
        ], static fn ($u) => is_string($u) && $u !== ''));

        if ($oldImageUrl && $oldImageUrl !== $category->image_url) {
            MediaFileCleaner::deleteIfOwnedAndUnreferenced(
                $oldImageUrl,
                $keep,
                exceptCategoryId: (int) $category->id,
            );
        }
        if ($oldOriginalUrl && $oldOriginalUrl !== $category->image_original_url) {
            MediaFileCleaner::deleteIfOwnedAndUnreferenced(
                $oldOriginalUrl,
                $keep,
                exceptCategoryId: (int) $category->id,
            );
        }
        if ($oldThumbUrl && $oldThumbUrl !== $category->thumb_url) {
            MediaFileCleaner::deleteIfOwnedAndUnreferenced(
                $oldThumbUrl,
                $keep,
                exceptCategoryId: (int) $category->id,
            );
        }
        if (is_string($oldImageWebpUrl) && $oldImageWebpUrl !== '' && $oldImageWebpUrl !== $category->getAttribute('image_webp_url')) {
            MediaFileCleaner::deleteIfOwnedAndUnreferenced(
                $oldImageWebpUrl,
                $keep,
                exceptCategoryId: (int) $category->id,
            );
        }
        if (is_string($oldThumbWebpUrl) && $oldThumbWebpUrl !== '' && $oldThumbWebpUrl !== $category->getAttribute('thumb_webp_url')) {
            MediaFileCleaner::deleteIfOwnedAndUnreferenced(
                $oldThumbWebpUrl,
                $keep,
                exceptCategoryId: (int) $category->id,
            );
        }

        return response()->json([
            'message' => 'Category updated successfully',
            'category' => $category,
        ]);
    }

    /**
     * Delete a category
     */
    public function destroy($id)
    {
        $category = Category::findOrFail($id);

        // Only live items block delete — soft-deleted leftovers are invisible in
        // admin and get category_id nulled by the FK (nullOnDelete) on destroy.
        if ($category->items()->count() > 0) {
            return response()->json([
                'message' => 'Cannot delete category with items. Please move or delete items first.',
            ], 422);
        }

        // Detach any soft-deleted items still pointing here (belt-and-suspenders
        // before the category row is removed).
        $category->items()->onlyTrashed()->update(['category_id' => null]);

        $category->delete();

        return response()->json([
            'message' => 'Category deleted successfully',
        ]);
    }

    /**
     * When an owned crop is set without thumb/webp sidecars, generate them via MenuImageProcessor.
     *
     * @param array<string, mixed> $validated
     * @return array<string, mixed>
     */
    private function ensureCategoryThumb(array $validated, ?Category $existing = null): array
    {
        $imageUrl = $validated['image_url'] ?? $existing?->image_url;
        $thumbUrl = array_key_exists('thumb_url', $validated)
            ? $validated['thumb_url']
            : $existing?->thumb_url;
        $imageWebpUrl = array_key_exists('image_webp_url', $validated)
            ? $validated['image_webp_url']
            : $existing?->getAttribute('image_webp_url');
        $thumbWebpUrl = array_key_exists('thumb_webp_url', $validated)
            ? $validated['thumb_webp_url']
            : $existing?->getAttribute('thumb_webp_url');

        if (!is_string($imageUrl) || $imageUrl === '') {
            return $validated;
        }

        $path = MediaFileCleaner::storagePathFromUrl($imageUrl);
        if ($path === null) {
            return $validated;
        }

        $needsThumb = !is_string($thumbUrl) || $thumbUrl === '';
        if ($needsThumb) {
            try {
                $thumbRel = $this->processor->storeThumbnailFromStoragePath($path);
                $validated['thumb_url'] = '/storage/' . ltrim($thumbRel, '/');
                $thumbUrl = $validated['thumb_url'];
            } catch (\Throwable) {
                // Leave thumb_url unset — client can retry or backfill later.
            }
        }

        if ((!is_string($imageWebpUrl) || $imageWebpUrl === '') && ImageCapabilities::supportsWebp()) {
            try {
                $webpRel = $this->processor->storeWebpFromStoragePath($path);
                if ($webpRel !== null) {
                    $validated['image_webp_url'] = '/storage/' . ltrim($webpRel, '/');
                }
            } catch (\Throwable) {
                // Optional sidecar — JPEG still serves.
            }
        }

        $thumbPath = is_string($thumbUrl) && $thumbUrl !== ''
            ? MediaFileCleaner::storagePathFromUrl($thumbUrl)
            : null;
        if ($thumbPath !== null && (!is_string($thumbWebpUrl) || $thumbWebpUrl === '') && ImageCapabilities::supportsWebp()) {
            try {
                $thumbWebpRel = $this->processor->storeWebpFromStoragePath($thumbPath, dirname($thumbPath));
                if ($thumbWebpRel !== null) {
                    $validated['thumb_webp_url'] = '/storage/' . ltrim($thumbWebpRel, '/');
                }
            } catch (\Throwable) {
                // Optional sidecar.
            }
        }

        return $validated;
    }
}
