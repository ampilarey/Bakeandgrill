<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Http\Requests\StoreItemRequest;
use App\Http\Requests\UpdateItemRequest;
use Illuminate\Http\Request;

class ItemController extends Controller
{
    /**
     * Display a listing of items
     */
    public function index(Request $request)
    {
        $query = Item::with(['category', 'variants', 'modifiers'])
            ->where('is_active', true);

        // Filter by category
        if ($request->has('category_id')) {
            $query->where('category_id', $request->category_id);
        }

        // Search by name or SKU
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('name_dv', 'like', "%{$search}%")
                  ->orWhere('sku', 'like', "%{$search}%");
            });
        }

        // Filter by availability
        if ($request->has('available_only')) {
            $query->where('is_available', true);
        }

        $items = $query->orderBy('sort_order')->orderBy('name')->paginate(50);

        return response()->json($items);
    }

    /**
     * Store a newly created item
     */
    public function store(StoreItemRequest $request)
    {
        $item = Item::create($request->validated());

        // Attach modifiers if provided
        if ($request->has('modifier_ids')) {
            $item->modifiers()->sync($request->modifier_ids);
        }

        return response()->json([
            'message' => 'Item created successfully',
            'item' => $item->load(['category', 'variants', 'modifiers']),
        ], 201);
    }

    /**
     * Display a specific item
     */
    public function show($id)
    {
        $item = Item::with(['category', 'variants', 'modifiers', 'recipe.recipeItems'])
            ->findOrFail($id);

        return response()->json(['item' => $item]);
    }

    /**
     * Update an item
     */
    public function update(UpdateItemRequest $request, $id)
    {
        $item = Item::findOrFail($id);
        $item->update($request->validated());

        // Update modifiers if provided
        if ($request->has('modifier_ids')) {
            $item->modifiers()->sync($request->modifier_ids);
        }

        return response()->json([
            'message' => 'Item updated successfully',
            'item' => $item->load(['category', 'variants', 'modifiers']),
        ]);
    }

    /**
     * Soft delete an item
     */
    public function destroy($id)
    {
        $item = Item::findOrFail($id);
        $item->delete();

        return response()->json([
            'message' => 'Item deleted successfully',
        ]);
    }

    /**
     * Lookup item by barcode
     */
    public function lookupByBarcode($barcode)
    {
        $item = Item::with(['category', 'variants', 'modifiers'])
            ->where('barcode', $barcode)
            ->where('is_active', true)
            ->where('is_available', true)
            ->firstOrFail();

        return response()->json(['item' => $item]);
    }

    /**
     * Toggle item availability
     */
    public function toggleAvailability($id)
    {
        $item = Item::findOrFail($id);
        $item->update(['is_available' => !$item->is_available]);

        return response()->json([
            'message' => 'Item availability updated',
            'item' => $item,
        ]);
    }
}
