<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Signage;

use App\Domains\Signage\Services\SignageResolver;
use App\Http\Controllers\Controller;
use App\Models\SignageDevice;
use App\Models\SiteSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class PublicSignageController extends Controller
{
    public function __construct(private readonly SignageResolver $resolver) {}

    public function show(Request $request, ?string $screen = null): JsonResponse
    {
        $storeId = $request->filled('store_id') ? (int) $request->query('store_id') : null;
        $payload = $this->resolver->resolve($screen, null, $storeId);

        // Resolver blanks wifi_password; restore only for approved paired TVs.
        if (
            is_array($payload['variables'] ?? null)
            && $request->filled('device_id')
        ) {
            $deviceId = (string) $request->query('device_id');
            $approved = SignageDevice::query()
                ->where('device_id', $deviceId)
                ->where('approved', true)
                ->exists();
            if ($approved) {
                $payload['variables']['wifi_password'] = (string) SiteSetting::get('signage_wifi_password', '');
            }
        }

        return response()->json($payload);
    }
}
