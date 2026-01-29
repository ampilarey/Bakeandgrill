<?php

namespace App\Services;

use App\Models\PrintJob;
use Illuminate\Support\Facades\Http;

class PrintProxyService
{
    public function send(PrintJob $job): bool
    {
        $response = Http::timeout(5)->post(
            rtrim(config('services.print_proxy.url'), '/') . '/print',
            $job->payload
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
