<?php

declare(strict_types=1);

namespace App\Domains\Webhooks\Jobs;

use App\Models\WebhookLog;
use App\Models\WebhookSubscription;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;

class DispatchWebhookJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public array $backoff = [10, 60, 300]; // 10s, 1min, 5min

    public function __construct(
        public WebhookSubscription $subscription,
        public string $event,
        public array $payload,
    ) {}

    public function handle(): void
    {
        $body = json_encode([
            'event'     => $this->event,
            'timestamp' => now()->toIso8601String(),
            'data'      => $this->payload,
        ]);

        $signature = hash_hmac('sha256', $body, $this->subscription->secret);

        $response = Http::timeout(15)
            ->withHeaders([
                'Content-Type'         => 'application/json',
                'X-Webhook-Signature'  => $signature,
                'X-Webhook-Event'      => $this->event,
            ])
            ->withBody($body, 'application/json')
            ->post($this->subscription->url);

        if ($response->failed()) {
            $this->subscription->markFailed();

            WebhookLog::create([
                'direction'                 => 'outgoing',
                'webhook_subscription_id'   => $this->subscription->id,
                'url'                       => $this->subscription->url,
                'event'                     => $this->event,
                'payload'                   => $this->payload,
                'response_code'             => $response->status(),
                'response_body'             => mb_substr($response->body(), 0, 2000),
                'status'                    => 'failed',
            ]);

            throw new \RuntimeException("Webhook delivery failed: HTTP {$response->status()}");
        }

        $this->subscription->markSuccess();

        WebhookLog::create([
            'direction'                 => 'outgoing',
            'webhook_subscription_id'   => $this->subscription->id,
            'url'                       => $this->subscription->url,
            'event'                     => $this->event,
            'payload'                   => $this->payload,
            'response_code'             => $response->status(),
            'response_body'             => mb_substr($response->body(), 0, 500),
            'status'                    => 'delivered',
        ]);
    }
}
