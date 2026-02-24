<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Domains\Payments\Gateway\BmlConnectService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Verifies the HMAC-SHA256 signature on incoming BML webhook requests.
 *
 * The raw body MUST be read before any JSON parsing, so this middleware
 * stashes it in the request attributes for downstream use.
 */
class VerifyBmlSignature
{
    public function __construct(private BmlConnectService $bml) {}

    public function handle(Request $request, Closure $next): Response
    {
        $rawBody = $request->getContent();
        $signature = $request->header('X-Signature', '');

        if (!$this->bml->verifyWebhookSignature($rawBody, $signature)) {
            return response()->json(['message' => 'Invalid signature'], 401);
        }

        $request->attributes->set('bml_raw_body', $rawBody);

        return $next($request);
    }
}
