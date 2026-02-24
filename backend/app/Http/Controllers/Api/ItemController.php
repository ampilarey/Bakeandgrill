<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreItemRequest;
use App\Http\Requests\UpdateItemRequest;
use App\Models\Item;
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
            $query->where(function ($q) use ($search) {
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

        // PUBLIC RESPONSE: Transform to hide internal data (cost, recipe)
        $transformed = $items->through(function ($item) {
            return [
                'id' => $item->id,
                'name' => $item->name,
                'name_dv' => $item->name_dv,
                'description' => $item->description,
                'sku' => $item->sku,
                'image_url' => $item->display_image_url,
                'base_price' => $item->base_price,
                'tax_rate' => $item->tax_rate,
                'is_available' => $item->is_available,
                'category_id' => $item->category_id,
                'category' => $item->category ? [
                    'id' => $item->category->id,
                    'name' => $item->category->name,
                ] : null,
                'variants' => $item->variants->map(fn ($v) => [
                    'id' => $v->id,
                    'name' => $v->name,
                    'price' => $v->price,
                ]),
                'modifiers' => $item->modifiers->map(fn ($m) => [
                    'id' => $m->id,
                    'name' => $m->name,
                    'price' => $m->price,
                ]),
            ];
        });

        return response()->json($transformed);
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
     * Display a specific item (PUBLIC - no recipe data)
     * For staff access with recipe data, use showWithRecipe
     */
    public function show($id)
    {
        $item = Item::with(['category', 'variants', 'modifiers'])
            ->where('is_active', true)
            ->findOrFail($id);

        // PUBLIC RESPONSE: Only customer-facing data, NO recipe/cost internals
        return response()->json([
            'item' => [
                'id' => $item->id,
                'name' => $item->name,
                'name_dv' => $item->name_dv,
                'description' => $item->description,
                'image_url' => $item->display_image_url,
                'base_price' => $item->base_price,
                'tax_rate' => $item->tax_rate,
                'is_available' => $item->is_available,
                'category' => $item->category ? [
                    'id' => $item->category->id,
                    'name' => $item->category->name,
                    'name_dv' => $item->category->name_dv,
                ] : null,
                'variants' => $item->variants->map(fn ($v) => [
                    'id' => $v->id,
                    'name' => $v->name,
                    'price' => $v->price,
                ]),
                'modifiers' => $item->modifiers->map(fn ($m) => [
                    'id' => $m->id,
                    'name' => $m->name,
                    'price' => $m->price,
                ]),
            ],
        ]);
    }

    /**
     * Display item with recipe data (STAFF ONLY)
     */
    public function showWithRecipe($id)
    {
        $item = Item::with(['category', 'variants', 'modifiers', 'recipe.recipeItems.inventoryItem'])
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
