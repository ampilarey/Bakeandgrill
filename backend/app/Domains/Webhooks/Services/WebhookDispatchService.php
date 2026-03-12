<?php

declare(strict_types=1);

namespace App\Domains\Webhooks\Services;

use App\Domains\Webhooks\Jobs\DispatchWebhookJob;
use App\Models\WebhookSubscription;

class WebhookDispatchService
{
    public function dispatch(string $event, array $payload): void
    {
        $subscriptions = WebhookSubscription::active()->forEvent($event)->get();

        foreach ($subscriptions as $subscription) {
            DispatchWebhookJob::dispatch($subscription, $event, $payload);
        }
    }
}
