<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryCategory;
use App\Models\UnitConversion;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Manages inventory categories and unit conversions.
 * Extracted from inline route closures in api_finance.php for testability.
 */
class InventoryConfigController extends Controller
{
    // ── Inventory Categories ──────────────────────────────────────────────────

    public function indexCategories()
    {
        return response()->json(['categories' => InventoryCategory::orderBy('name')->get()]);
    }

    public function storeCategory(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'description' => 'nullable|string',
        ]);

        $cat = InventoryCategory::create([
            ...$validated,
            'slug' => Str::slug($validated['name']),
        ]);

        return response()->json(['category' => $cat], 201);
    }

    public function updateCategory(Request $request, int $id)
    {
        $cat = InventoryCategory::findOrFail($id);

        $cat->update($request->validate([
            'name' => 'sometimes|string|max:100',
            'description' => 'nullable|string',
            'is_active' => 'sometimes|boolean',
        ]));

        return response()->json(['category' => $cat]);
    }

    // ── Unit Conversions ──────────────────────────────────────────────────────

    public function indexConversions()
    {
        return response()->json(['conversions' => UnitConversion::all()]);
    }

    public function storeConversion(Request $request)
    {
        $v = $request->validate([
            'from_unit' => 'required|string|max:20',
            'to_unit' => 'required|string|max:20',
            'factor' => 'required|numeric|min:0.000001',
        ]);

        $uc = UnitConversion::updateOrCreate(
            ['from_unit' => $v['from_unit'], 'to_unit' => $v['to_unit']],
            ['factor' => $v['factor']],
        );

        app(\App\Services\UnitConversionService::class)->bustCache();

        return response()->json(['conversion' => $uc], 201);
    }

    public function destroyConversion(int $id)
    {
        UnitConversion::findOrFail($id)->delete();
        app(\App\Services\UnitConversionService::class)->bustCache();

        return response()->json(['message' => 'Deleted.']);
    }
}
