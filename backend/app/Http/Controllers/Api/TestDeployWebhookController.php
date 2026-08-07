<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Deploy\TestDeployTrigger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Immediate TEST auto-pull trigger for GitHub Actions (after CI is green).
 *
 * Production never honours this endpoint. Requires TEST_DEPLOY_WEBHOOK_SECRET.
 */
class TestDeployWebhookController extends Controller
{
    public function __invoke(Request $request, TestDeployTrigger $trigger): JsonResponse
    {
        $secret = (string) config('deploy.test_webhook_secret', '');
        if ($secret === '' || strlen($secret) < 16) {
            return response()->json(['message' => 'Not found'], 404);
        }

        if (! $this->isTestHost($request)) {
            Log::warning('TEST deploy webhook rejected: host not allowed', [
                'host' => $request->getHost(),
                'app_url' => config('app.url'),
            ]);

            return response()->json(['message' => 'Not found'], 404);
        }

        $provided = $this->extractSecret($request);
        if ($provided === '' || ! hash_equals($secret, $provided)) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $sha = $request->input('sha');
        $expectedSha = is_string($sha) && preg_match('/^[0-9a-f]{40}$/i', $sha) === 1
            ? strtolower($sha)
            : null;

        try {
            $result = $trigger->triggerAsync($expectedSha);
        } catch (\Throwable $e) {
            Log::error('TEST deploy webhook failed', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Deploy trigger failed', 'error' => $e->getMessage()], 500);
        }

        if (! $result['ok']) {
            return response()->json(['message' => $result['message']], 503);
        }

        return response()->json([
            'message' => $result['message'],
            'sha' => $expectedSha,
            'log' => '~/self-update-test.log',
        ], 202);
    }

    private function extractSecret(Request $request): string
    {
        $header = $request->header('Authorization', '');
        if (is_string($header) && str_starts_with($header, 'Bearer ')) {
            return trim(substr($header, 7));
        }

        $headerSecret = $request->header('X-Deploy-Secret', '');

        return is_string($headerSecret) ? trim($headerSecret) : '';
    }

    private function isTestHost(Request $request): bool
    {
        /** @var list<string> $allowed */
        $allowed = config('deploy.test_allowed_hosts', ['test.bakeandgrill.mv']);
        $allowed = array_map(static fn (string $h): string => strtolower($h), $allowed);

        $requestHost = strtolower($request->getHost());
        if (in_array($requestHost, $allowed, true)) {
            return true;
        }

        $appUrl = (string) config('app.url', '');
        $appHost = strtolower((string) (parse_url($appUrl, PHP_URL_HOST) ?: ''));

        return $appHost !== '' && in_array($appHost, $allowed, true);
    }
}
