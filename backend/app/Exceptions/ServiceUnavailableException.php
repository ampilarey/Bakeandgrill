<?php

declare(strict_types=1);

namespace App\Exceptions;

use App\Models\ServiceState;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Thrown by ServiceAvailabilityService::assertAvailable when a service_key
 * is not currently `available`.
 *
 * Rendered to the §12 JSON shape with HTTP 503 (Service Unavailable) — this
 * is semantically correct (retriable, temporary) and won't be mistaken for
 * a 422 validation error by frontends. Legacy gate services keep their
 * existing 422 semantics; this exception is only used by the new guards.
 */
class ServiceUnavailableException extends HttpException
{
    public function __construct(
        public readonly string $serviceKey,
        public readonly ?ServiceState $state = null,
        ?string $message = null,
    ) {
        parent::__construct(
            statusCode: 503,
            message: $message ?? ($state?->public_message ?: 'Service is temporarily unavailable.'),
        );
    }

    public function render(Request $request): JsonResponse
    {
        $state = $this->state;

        return response()->json([
            'code' => 'SERVICE_UNAVAILABLE',
            'service_key' => $this->serviceKey,
            'message' => $this->getMessage(),
            'alternatives' => $state?->alternatives ?? [],
            'retry_at' => optional($state?->ends_at)->toIso8601String(),
            'notify_enabled' => (bool) ($state?->notify_enabled ?? false),
        ], 503);
    }
}
