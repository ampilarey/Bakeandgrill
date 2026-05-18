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

    public int $timeout = 30; // HTTP client already has 15s timeout; job-level adds headroom

    public function __construct(
        public WebhookSubscription $subscription,
        public string $event,
        public array $payload,
    ) {}

    public function handle(): void
    {
        // SSRF defense: reject anything that resolves to a local-network IP
        // before we make the HTTP call. Webhook subscriptions are
        // owner-configured but the audit found no validation on the URL
        // host, so a hostile (or careless) owner could point a webhook at
        // 127.0.0.1, the AWS metadata service (169.254.169.254), or the
        // internal Redis/MySQL ports and exfiltrate data through the
        // response body in WebhookLog.
        if (!$this->isSafeOutboundUrl($this->subscription->url)) {
            WebhookLog::create([
                'direction' => 'outgoing',
                'webhook_subscription_id' => $this->subscription->id,
                'url' => $this->subscription->url,
                'event' => $this->event,
                'payload' => $this->payload,
                'response_code' => 0,
                'response_body' => 'Refused: URL resolves to a private/loopback/metadata address (SSRF guard).',
                'status' => 'failed',
            ]);
            $this->subscription->markFailed();
            throw new \RuntimeException('Webhook URL points to a forbidden network range.');
        }

        $body = json_encode([
            'event' => $this->event,
            'timestamp' => now()->toIso8601String(),
            'data' => $this->payload,
        ]);

        $signature = hash_hmac('sha256', $body, $this->subscription->secret);

        $response = Http::timeout(15)
            ->withHeaders([
                'Content-Type' => 'application/json',
                'X-Webhook-Signature' => $signature,
                'X-Webhook-Event' => $this->event,
            ])
            ->withBody($body, 'application/json')
            ->post($this->subscription->url);

        if ($response->failed()) {
            $this->subscription->markFailed();

            WebhookLog::create([
                'direction' => 'outgoing',
                'webhook_subscription_id' => $this->subscription->id,
                'url' => $this->subscription->url,
                'event' => $this->event,
                'payload' => $this->payload,
                'response_code' => $response->status(),
                'response_body' => mb_substr($response->body(), 0, 2000),
                'status' => 'failed',
            ]);

            throw new \RuntimeException("Webhook delivery failed: HTTP {$response->status()}");
        }

        $this->subscription->markSuccess();

        WebhookLog::create([
            'direction' => 'outgoing',
            'webhook_subscription_id' => $this->subscription->id,
            'url' => $this->subscription->url,
            'event' => $this->event,
            'payload' => $this->payload,
            'response_code' => $response->status(),
            'response_body' => mb_substr($response->body(), 0, 500),
            'status' => 'delivered',
        ]);
    }

    /**
     * Block webhook deliveries to RFC1918 (private), loopback, link-local,
     * and cloud metadata endpoints. Returns true only when the URL is
     * https?:// AND every resolved A/AAAA record is a public address.
     */
    private function isSafeOutboundUrl(string $url): bool
    {
        $parsed = parse_url($url);
        if (!$parsed || !in_array(strtolower($parsed['scheme'] ?? ''), ['http', 'https'], true)) {
            return false;
        }
        $host = $parsed['host'] ?? '';
        if ($host === '') {
            return false;
        }

        // Resolve all A/AAAA records; any one falling in a forbidden range fails.
        $ips = [];
        $a = @dns_get_record($host, DNS_A) ?: [];
        $aaaa = @dns_get_record($host, DNS_AAAA) ?: [];
        foreach ($a as $r) {
            if (!empty($r['ip'])) $ips[] = $r['ip'];
        }
        foreach ($aaaa as $r) {
            if (!empty($r['ipv6'])) $ips[] = $r['ipv6'];
        }
        // If hostname is itself an IP literal, evaluate that directly.
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            $ips[] = $host;
        }
        if (empty($ips)) {
            return false; // unresolved → treat as unsafe
        }

        foreach ($ips as $ip) {
            // FILTER_FLAG_NO_PRIV_RANGE rejects 10/8, 172.16/12, 192.168/16, fc00::/7.
            // FILTER_FLAG_NO_RES_RANGE rejects loopback, link-local, etc.
            $isPublic = filter_var(
                $ip,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE,
            );
            if (!$isPublic) return false;

            // Explicitly block cloud metadata service.
            if ($ip === '169.254.169.254' || $ip === 'fd00:ec2::254') return false;
        }
        return true;
    }

    public function failed(\Throwable $e): void
    {
        \Illuminate\Support\Facades\Log::error('DispatchWebhookJob: exhausted retries', [
            'subscription_id' => $this->subscription->id,
            'event' => $this->event,
            'url' => $this->subscription->url,
            'error' => $e->getMessage(),
        ]);

        if (app()->bound('sentry')) {
            \Sentry\captureException($e);
        }
    }
}
