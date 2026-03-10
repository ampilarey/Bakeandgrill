<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\PushSubscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Log;

class PushSubscriptionController extends Controller
{
    public function subscribe(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'endpoint'   => ['required', 'string', 'max:1000'],
            'p256dh_key' => ['required', 'string', 'max:255'],
            'auth_key'   => ['required', 'string', 'max:100'],
        ]);

        $customerId = $request->user()?->id;

        PushSubscription::updateOrCreate(
            ['endpoint' => $validated['endpoint']],
            [
                'customer_id' => $customerId,
                'p256dh_key'  => $validated['p256dh_key'],
                'auth_key'    => $validated['auth_key'],
            ],
        );

        return response()->json(['message' => 'Subscribed to push notifications.']);
    }

    public function unsubscribe(Request $request): JsonResponse
    {
        $validated = $request->validate(['endpoint' => ['required', 'string']]);

        PushSubscription::where('endpoint', $validated['endpoint'])->delete();

        return response()->json(['message' => 'Unsubscribed.']);
    }

    /**
     * Send a push notification to a specific customer.
     * Intended for internal use (called from event listeners or services).
     */
    public static function notifyCustomer(int $customerId, string $title, string $body, string $url = '/'): void
    {
        $subscriptions = PushSubscription::where('customer_id', $customerId)->get();

        foreach ($subscriptions as $sub) {
            self::sendWebPush($sub, $title, $body, $url);
        }
    }

    private static function sendWebPush(PushSubscription $sub, string $title, string $body, string $url): void
    {
        $vapidPublicKey  = config('services.vapid.public_key');
        $vapidPrivateKey = config('services.vapid.private_key');

        if (!$vapidPublicKey || !$vapidPrivateKey) {
            Log::debug('PushSubscriptionController: VAPID keys not configured, skipping push.');

            return;
        }

        $payload = json_encode(['title' => $title, 'body' => $body, 'url' => $url]);

        try {
            // Using the minishlink/web-push library (install if needed)
            // For now we log the intent — real implementation requires composer package
            Log::info('PushSubscriptionController: Would send push', [
                'endpoint' => substr($sub->endpoint, 0, 50) . '…',
                'title'    => $title,
                'body'     => $body,
            ]);
        } catch (\Throwable $e) {
            Log::error('PushSubscriptionController: Failed to send push', [
                'error' => $e->getMessage(),
            ]);
            // Remove invalid/expired subscriptions
            if (str_contains($e->getMessage(), '410')) {
                $sub->delete();
            }
        }
    }
}
