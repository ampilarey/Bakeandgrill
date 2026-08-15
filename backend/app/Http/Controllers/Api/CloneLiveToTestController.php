<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Ops\CloneLiveToTestTrigger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Owner-only LIVE→TEST data/media clone. Available only on TEST hosts.
 */
class CloneLiveToTestController extends Controller
{
    public function __construct(private readonly CloneLiveToTestTrigger $trigger) {}

    public function status(Request $request): JsonResponse
    {
        if (! $this->isAllowed($request)) {
            return response()->json(['available' => false, 'reason' => 'not_test_host']);
        }

        $status = $this->trigger->readStatus();
        $running = $this->trigger->isRunning();

        return response()->json([
            'available' => $this->trigger->scriptAvailable(),
            'running' => $running,
            'status' => $status,
            'log_tail' => $running || ($status['state'] ?? '') !== 'idle'
                ? $this->trigger->logTail(30)
                : '',
        ]);
    }

    public function start(Request $request): JsonResponse
    {
        if (! $this->isAllowed($request)) {
            Log::warning('clone-live-to-test rejected: host not allowed', [
                'host' => $request->getHost(),
                'app_url' => config('app.url'),
                'user_id' => $request->user()?->id,
            ]);

            return response()->json(['message' => 'Not available on this environment'], 404);
        }

        if (! $this->trigger->scriptAvailable()) {
            return response()->json(['message' => 'Clone script not found on server'], 503);
        }

        $confirm = (string) $request->input('confirm', '');
        if ($confirm !== 'CLONE FROM LIVE') {
            return response()->json([
                'message' => 'Type CLONE FROM LIVE to confirm. This overwrites the TEST database.',
            ], 422);
        }

        try {
            $result = $this->trigger->triggerAsync();
        } catch (\Throwable $e) {
            Log::error('clone-live-to-test failed', ['error' => $e->getMessage()]);

            return response()->json(['message' => $e->getMessage()], 500);
        }

        if (! $result['ok']) {
            return response()->json(['message' => $result['message']], 409);
        }

        return response()->json([
            'message' => $result['message'],
            'status' => $this->trigger->readStatus(),
        ], 202);
    }

    private function isAllowed(Request $request): bool
    {
        if (! (bool) config('deploy.clone_live_to_test.enabled', true)) {
            return false;
        }

        $host = strtolower($request->getHost());
        $appHost = strtolower((string) parse_url((string) config('app.url'), PHP_URL_HOST));

        $blocked = array_map('strtolower', config('deploy.clone_live_to_test.blocked_hosts', []));
        if (in_array($host, $blocked, true) || ($appHost !== '' && in_array($appHost, $blocked, true))) {
            return false;
        }

        $allowed = array_map('strtolower', config('deploy.clone_live_to_test.allowed_hosts', []));
        if ($allowed === []) {
            return false;
        }

        return in_array($host, $allowed, true) || ($appHost !== '' && in_array($appHost, $allowed, true));
    }
}
