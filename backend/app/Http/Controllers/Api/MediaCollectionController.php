<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MediaCollection;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class MediaCollectionController extends Controller
{
    public function __construct(
        private readonly AuditLogService $audit,
    ) {}

    public function index(): JsonResponse
    {
        $rows = MediaCollection::query()
            ->withCount('assets')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100|unique:media_collections,name',
            'description' => 'nullable|string|max:255',
            'sort_order' => 'nullable|integer|min:0|max:9999',
        ]);

        $collection = MediaCollection::create([
            'name' => $validated['name'],
            'slug' => Str::slug($validated['name']),
            'description' => $validated['description'] ?? null,
            'sort_order' => $validated['sort_order'] ?? 0,
        ]);

        $this->audit->log('media.collection.created', 'MediaCollection', (int) $collection->id, [], $collection->toArray(), [], $request);

        return response()->json(['data' => $collection], 201);
    }

    public function update(Request $request, MediaCollection $collection): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:100|unique:media_collections,name,' . $collection->id,
            'description' => 'nullable|string|max:255',
            'sort_order' => 'nullable|integer|min:0|max:9999',
        ]);

        $old = $collection->toArray();
        if (isset($validated['name'])) {
            $collection->name = $validated['name'];
            $collection->slug = Str::slug($validated['name']);
        }
        if (array_key_exists('description', $validated)) {
            $collection->description = $validated['description'];
        }
        if (array_key_exists('sort_order', $validated)) {
            $collection->sort_order = (int) $validated['sort_order'];
        }
        $collection->save();

        $this->audit->log('media.collection.updated', 'MediaCollection', (int) $collection->id, $old, $collection->toArray(), [], $request);

        return response()->json(['data' => $collection->fresh()]);
    }

    public function destroy(Request $request, MediaCollection $collection): JsonResponse
    {
        $id = (int) $collection->id;
        $collection->delete();
        $this->audit->log('media.collection.deleted', 'MediaCollection', $id, [], [], [], $request);

        return response()->json(['ok' => true]);
    }
}
