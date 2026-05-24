<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Payments\Services\PaymentService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Handles BML Connect payment webhook callbacks.
 *
 * Returns 200 for successfully processed or duplicate (idempotent) webhooks.
 * Returns 503 for signature verification failures so BML can retry with a valid payload.
 */
class BmlWebhookController extends Controller
{
    public function __construct(private PaymentService $paymentService) {}

    public function handle(Request $request): JsonResponse
    {
        $rawBody = $request->attributes->get('bml_raw_body', $request->getContent());
        $headers = $request->headers->all();

        try {
            $this->paymentService->handleBmlWebhook($rawBody, $headers);
        } catch (\RuntimeException $e) {
            if (str_contains($e->getMessage(), 'signature verification failed')) {
                Log::warning('BML webhook rejected: invalid signature', ['error' => $e->getMessage()]);

                return response()->json(['status' => 'error', 'message' => 'invalid signature'], 503);
            }

            Log::error('BML webhook error', ['error' => $e->getMessage()]);

            return response()->json(['status' => 'error', 'message' => 'logged'], 200);
        } catch (\Throwable $e) {
            Log::error('BML webhook error', ['error' => $e->getMessage()]);

            return response()->json(['status' => 'error', 'message' => 'logged'], 200);
        }

        return response()->json(['status' => 'ok'], 200);
    }
}
