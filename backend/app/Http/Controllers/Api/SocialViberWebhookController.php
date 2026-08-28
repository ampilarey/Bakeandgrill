<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\SocialChannel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Viber webhook receiver (plan §2g). Viber requires a registered HTTPS
 * webhook before its Channels Post API accepts posts; we register it lazily
 * from the driver and simply acknowledge events here — nothing is processed.
 *
 * Every request is verified against X-Viber-Content-Signature (HMAC-SHA256
 * of the raw body with the channel auth token, constant-time compare) for
 * each enabled Viber channel. Unverifiable requests get 403. Responses never
 * echo tokens or request content. Viber offers no nonce/timestamp, so replay
 * protection beyond the signature is not available — acceptable because the
 * endpoint has no side effects.
 */
class SocialViberWebhookController extends Controller
{
    public function handle(Request $request): JsonResponse
    {
        $signature = trim((string) $request->header('X-Viber-Content-Signature', ''));
        if ($signature === '' || !$this->signatureMatchesAnyChannel($signature, (string) $request->getContent())) {
            abort(403);
        }

        return response()->json(['status' => 0, 'status_message' => 'ok']);
    }

    private function signatureMatchesAnyChannel(string $signature, string $rawBody): bool
    {
        $channels = SocialChannel::query()->where('platform', 'viber')->get();
        foreach ($channels as $channel) {
            $token = $channel->credential('auth_token');
            if ($token === '') {
                continue;
            }
            if (hash_equals(hash_hmac('sha256', $rawBody, $token), $signature)) {
                return true;
            }
        }

        return false;
    }
}
