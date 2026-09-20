<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use App\Services\SupplierProfileService;
use Illuminate\Http\JsonResponse;

/**
 * Purchasing → Suppliers → one supplier (owner, 2026-09-20): everything
 * bought from them, in one place.
 */
class SupplierProfileController extends Controller
{
    public function __construct(private readonly SupplierProfileService $profile) {}

    /** GET /purchasing/suppliers/{id}/overview */
    public function overview(int $id): JsonResponse
    {
        return response()->json($this->profile->overview(Supplier::findOrFail($id)));
    }

    /** GET /purchasing/payables — what is owed to whom. */
    public function payables(): JsonResponse
    {
        return response()->json($this->profile->payables());
    }

    /** GET /purchasing/suppliers/{id}/items */
    public function items(int $id): JsonResponse
    {
        return response()->json($this->profile->items(Supplier::findOrFail($id)));
    }
}
