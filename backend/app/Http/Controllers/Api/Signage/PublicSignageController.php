<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Signage;

use App\Domains\Signage\Services\SignageResolver;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class PublicSignageController extends Controller
{
    public function __construct(private readonly SignageResolver $resolver) {}

    public function show(Request $request, ?string $screen = null): JsonResponse
    {
        $storeId = $request->filled('store_id') ? (int) $request->query('store_id') : null;
        $payload = $this->resolver->resolve($screen, null, $storeId);

        return response()->json($payload);
    }
}
