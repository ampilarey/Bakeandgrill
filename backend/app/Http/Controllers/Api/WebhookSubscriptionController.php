<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Webhooks\Listeners\DispatchWebhookOnDomainEvent;
use App\Http\Controllers\Controller;
use App\Models\WebhookLog;
use App\Models\WebhookSubscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class WebhookSubscriptionController extends Controller
{
    public function index(): JsonResponse
    {
        $subscriptions = WebhookSubscription::orderByDesc('created_at')->get();

        return response()->json(['subscriptions' => $subscriptions]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'   => ['required', 'string', 'max:100'],
            'url'    => ['required', 'url', 'max:500'],
            'events' => ['required', 'array', 'min:1'],
            'events.*' => ['string', 'in:' . implode(',', DispatchWebhookOnDomainEvent::getSupportedEventNames())],
        ]);

        $subscription = WebhookSubscription::create([
            'name'   => $validated['name'],
            'url'    => $validated['url'],
            'events' => $validated['events'],
            'secret' => Str::random(40),
            'active' => true,
        ]);

        return response()->json(['subscription' => $subscription], 201);
    }

    public function show(int $id): JsonResponse
    {
        $subscription = WebhookSubscription::with(['logs' => fn($q) => $q->orderByDesc('created_at')->limit(20)])
            ->findOrFail($id);

        return response()->json(['subscription' => $subscription]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $subscription = WebhookSubscription::findOrFail($id);

        $validated = $request->validate([
            'name'   => ['sometimes', 'string', 'max:100'],
            'url'    => ['sometimes', 'url', 'max:500'],
            'events' => ['sometimes', 'array', 'min:1'],
            'events.*' => ['string', 'in:' . implode(',', DispatchWebhookOnDomainEvent::getSupportedEventNames())],
            'active' => ['sometimes', 'boolean'],
        ]);

        // Re-enable if admin manually sets active
        if (isset($validated['active']) && $validated['active']) {
            $validated['disabled_at'] = null;
            $validated['failure_count'] = 0;
        }

        $subscription->update($validated);

        return response()->json(['subscription' => $subscription]);
    }

    public function destroy(int $id): JsonResponse
    {
        WebhookSubscription::findOrFail($id)->delete();

        return response()->json(['message' => 'Deleted.']);
    }

    public function rotateSecret(int $id): JsonResponse
    {
        $subscription = WebhookSubscription::findOrFail($id);
        $subscription->update(['secret' => Str::random(40)]);

        return response()->json(['secret' => $subscription->secret]);
    }

    public function logs(Request $request, int $id): JsonResponse
    {
        WebhookSubscription::findOrFail($id);

        $logs = WebhookLog::where('webhook_subscription_id', $id)
            ->orderByDesc('created_at')
            ->paginate(50);

        return response()->json($logs);
    }

    public function supportedEvents(): JsonResponse
    {
        return response()->json([
            'events' => DispatchWebhookOnDomainEvent::getSupportedEventNames(),
        ]);
    }
}
