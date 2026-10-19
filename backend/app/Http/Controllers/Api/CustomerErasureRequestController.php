<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerErasureRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerErasureRequestController extends Controller
{
    /**
     * POST /api/customer/erasure-request
     *
     * The signed-in customer asks to be erased. An owner completes it
     * from Customers. A second ask while one is open returns the same row.
     */
    public function store(Request $request): JsonResponse
    {
        $customer = $request->user();
        if (!$customer instanceof Customer) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $existing = CustomerErasureRequest::query()
            ->where('customer_id', $customer->id)
            ->where('status', 'pending')
            ->first();

        if ($existing) {
            return response()->json([
                'message' => 'We already have your request. The owner will erase your personal data.',
                'requested_at' => $existing->requested_at,
            ]);
        }

        $row = CustomerErasureRequest::query()->create([
            'customer_id' => $customer->id,
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        return response()->json([
            'message' => 'Request received. The owner will erase your personal data. Orders and payments are kept by number and amount.',
            'requested_at' => $row->requested_at,
        ], 201);
    }
}
