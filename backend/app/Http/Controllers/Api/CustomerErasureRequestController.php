<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerErasureRequest;
use App\Support\OwnerPhones;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class CustomerErasureRequestController extends Controller
{
    public const ALERT = 'owner_erasure_request';

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

        // Somebody has to act on it (review, 2026-10-19): it is a row under Needs attention,
        // and the owners are told once, without the customer's details in the text.
        if (AlertSwitch::isOn(self::ALERT)) {
            foreach (OwnerPhones::for(self::ALERT) as $phone) {
                try {
                    app(SmsService::class)->send(new SmsMessage(
                        to: $phone,
                        message: 'Bake & Grill: a customer asked for their personal data to be erased. Admin → Customers → Asked to be erased.',
                        type: self::ALERT,
                        referenceType: 'customer_erasure_request',
                        referenceId: (string) $row->id,
                        idempotencyKey: 'erasure-request:' . $row->id . ':' . $phone,
                    ));
                } catch (\Throwable $e) {
                    Log::warning('Erasure request alert failed', ['request_id' => $row->id, 'error' => $e->getMessage()]);
                }
            }
        }

        return response()->json([
            'message' => 'Request received. The owner will erase your personal data. Orders and payments are kept by number and amount.',
            'requested_at' => $row->requested_at,
        ], 201);
    }
}
