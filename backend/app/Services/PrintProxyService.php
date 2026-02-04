<?php

namespace App\Services;

use App\Models\PrintJob;
use Illuminate\Support\Facades\Http;

class PrintProxyService
{
    public function send(PrintJob $job): bool
    {
        $printProxyKey = config('services.print_proxy.key');
        
        if (!$printProxyKey) {
            \Log::error('PRINT_PROXY_KEY not configured');
            $job->update([
                'status' => 'failed',
                'attempts' => $job->attempts + 1,
                'last_error' => 'Print proxy key not configured',
            ]);
            return false;
        }

        // Extract printer name from payload (should be set by OrderCreationService)
        $payload = $job->payload;
        $payload['printer_name'] = $payload['printer']['name'] ?? null;
        $payload['type'] = $payload['printer']['type'] ?? 'kitchen';
        
        // Send with API key header
        $response = Http::timeout(10)
            ->withHeaders([
                'X-Print-Key' => $printProxyKey,
            ])
            ->post(
                rtrim(config('services.print_proxy.url'), '/') . '/print',
                $payload
            );

        if ($response->successful()) {
            $job->update([
                'status' => 'printed',
                'attempts' => $job->attempts + 1,
                'last_error' => null,
            ]);

            return true;
        }

        $job->update([
            'status' => 'failed',
            'attempts' => $job->attempts + 1,
            'last_error' => $response->body(),
        ]);

        return false;
    }
}
