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
 * IMPORTANT: This endpoint must:
 *   1. Read raw body BEFORE any middleware transforms it
 *   2. Always return 200 OK to BML, even on errors (BML retries on non-200)
 *   3. Never trust — only record and process
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
        } catch (\Throwable $e) {
            Log::error('BML webhook error', ['error' => $e->getMessage()]);

            // Return 200 to prevent BML retries flooding our server.
            // The error is logged and can be replayed from webhook_logs.
            return response()->json(['status' => 'error', 'message' => 'logged'], 200);
        }

        return response()->json(['status' => 'ok'], 200);
    }
}
