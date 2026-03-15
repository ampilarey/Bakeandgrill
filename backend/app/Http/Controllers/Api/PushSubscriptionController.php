<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Notifications\Services\PushNotificationService;
use App\Models\PushSubscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class PushSubscriptionController extends Controller
{
    public function __construct(private PushNotificationService $pushService) {}

    public function subscribe(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'endpoint'   => ['required', 'string', 'max:1000'],
            'p256dh_key' => ['required', 'string', 'max:500'],
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
     * Return the VAPID public key so the frontend can subscribe.
     */
    public function vapidKey(): JsonResponse
    {
        return response()->json([
            'public_key' => config('services.vapid.public_key', ''),
        ]);
    }
}
