<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
    /**
     * Display all categories with items
     */
    public function index(Request $request)
    {
        $isAdmin = (bool) $request->query('admin');

        $query = Category::with(['items' => function ($q) use ($isAdmin) {
            if (!$isAdmin) {
                $q->where('is_active', true)->where('is_available', true);
            }
            $q->orderBy('sort_order')->orderBy('name');
        }]);

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
        $data = $request->all();
        if (isset($data['image_url']) && $data['image_url'] === '') {
            $data['image_url'] = null;
        }
        $validated = validator($data, [
            'name'       => 'required|string|max:255',
            'name_dv'    => 'nullable|string|max:255',
            'description'=> 'nullable|string',
            'sort_order' => 'nullable|integer',
            'is_active'  => 'nullable|boolean',
            'image_url'  => 'nullable|url',
        ])->validate();

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
        $data = $request->all();
        if (isset($data['image_url']) && $data['image_url'] === '') {
            $data['image_url'] = null;
        }
        $validated = validator($data, [
            'name'        => 'sometimes|string|max:255',
            'name_dv'     => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'sort_order'  => 'nullable|integer',
            'is_active'   => 'sometimes|boolean',
            'image_url'   => 'nullable|url',
        ])->validate();

        $category = Category::findOrFail($id);
        $category->update($validated);

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

        // Check if category has items
        if ($category->items()->count() > 0) {
            return response()->json([
                'message' => 'Cannot delete category with items. Please move or delete items first.',
            ], 422);
        }

        $category->delete();

        return response()->json([
            'message' => 'Category deleted successfully',
        ]);
    }
}
