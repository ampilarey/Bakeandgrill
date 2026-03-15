<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Services;

use App\Models\PushSubscription;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

/**
 * Sends Web Push notifications via VAPID.
 *
 * Requires VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env.
 * Generate keys: php artisan push:generate-vapid
 */
class PushNotificationService
{
    public function notifyCustomer(int $customerId, string $title, string $body, string $url = '/order/'): void
    {
        $subscriptions = PushSubscription::where('customer_id', $customerId)->get();

        if ($subscriptions->isEmpty()) {
            return;
        }

        $webPush = $this->makeWebPush();
        if ($webPush === null) {
            return;
        }

        $payload = json_encode(['title' => $title, 'body' => $body, 'url' => $url]);

        foreach ($subscriptions as $sub) {
            $webPush->queueNotification(
                Subscription::create([
                    'endpoint'  => $sub->endpoint,
                    'publicKey' => $sub->p256dh_key,
                    'authToken' => $sub->auth_key,
                ]),
                $payload,
            );
        }

        foreach ($webPush->flush() as $report) {
            $endpoint = $report->getRequest()->getUri()->__toString();

            if ($report->isSuccess()) {
                Log::debug('PushNotification: sent', ['endpoint' => substr($endpoint, 0, 60)]);
            } elseif ($report->isSubscriptionExpired()) {
                // Remove stale subscriptions automatically
                PushSubscription::where('endpoint', $endpoint)->delete();
                Log::info('PushNotification: removed expired subscription', ['endpoint' => substr($endpoint, 0, 60)]);
            } else {
                Log::warning('PushNotification: delivery failed', [
                    'endpoint' => substr($endpoint, 0, 60),
                    'reason'   => $report->getReason(),
                ]);
            }
        }
    }

    private function makeWebPush(): ?WebPush
    {
        $publicKey  = config('services.vapid.public_key');
        $privateKey = config('services.vapid.private_key');
        $subject    = config('services.vapid.subject', config('app.url'));

        if (empty($publicKey) || empty($privateKey)) {
            Log::debug('PushNotificationService: VAPID keys not configured — skipping push.');

            return null;
        }

        return new WebPush([
            'VAPID' => [
                'subject'    => $subject,
                'publicKey'  => $publicKey,
                'privateKey' => $privateKey,
            ],
        ]);
    }
}
