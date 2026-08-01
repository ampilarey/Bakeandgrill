<?php

declare(strict_types=1);

namespace App\Domains\Webhooks\Services;

use App\Domains\Webhooks\Jobs\DispatchWebhookJob;
use App\Models\WebhookSubscription;
use App\Support\ResilientDispatch;

class WebhookDispatchService
{
    public function dispatch(string $event, array $payload): void
    {
        $subscriptions = WebhookSubscription::active()->forEvent($event)->get();

        foreach ($subscriptions as $subscription) {
            ResilientDispatch::jobClass(DispatchWebhookJob::class, $subscription, $event, $payload);
        }
    }
}
