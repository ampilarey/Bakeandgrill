<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * @deprecated Prefer CateringRequestController. Thin legacy wrapper for old clients.
 */
class CorporateInquiryController extends CateringRequestController
{
    public function store(Request $request): JsonResponse
    {
        if (!$request->filled('occasion')) {
            $request->merge(['occasion' => 'office_breakfast']);
        }
        if (!$request->filled('event_date')) {
            $request->merge(['event_date' => now()->addDay()->toDateString()]);
        }

        $response = parent::store($request);
        $payload = $response->getData(true);
        if (is_array($payload) && isset($payload['request'])) {
            $payload['inquiry'] = $payload['request'];
        }

        return response()->json($payload, $response->getStatusCode());
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $status = $request->input('status');
        if ($status === 'closed') {
            $request->merge(['status' => 'cancelled']);
        }

        return $this->update($request, $id);
    }
}
