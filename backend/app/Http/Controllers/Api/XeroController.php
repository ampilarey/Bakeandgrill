<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Accounting\Services\XeroOAuthService;
use App\Domains\Accounting\Services\XeroSyncService;
use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Models\Invoice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class XeroController extends Controller
{
    public function __construct(
        private XeroOAuthService $oauth,
        private XeroSyncService $sync,
    ) {}

    /**
     * Return the Xero OAuth authorization URL as JSON for SPA redirect.
     */
    public function connect(Request $request): JsonResponse
    {
        $state = Str::random(40);
        Cache::put('xero_oauth_state_'.$request->user()->id, $state, 300);

        return response()->json([
            'redirect_url' => $this->oauth->getAuthorizationUrl($state),
        ]);
    }

    /**
     * Handle OAuth callback from Xero.
     */
    public function callback(Request $request): JsonResponse
    {
        $expected = Cache::pull('xero_oauth_state_'.$request->user()->id);
        if (! $expected || ! hash_equals($expected, (string) $request->query('state'))) {
            return response()->json(['message' => 'Invalid OAuth state.'], 422);
        }

        $code = $request->query('code');
        if (! $code) {
            return response()->json(['message' => 'Authorization code missing.'], 422);
        }

        $connection = $this->oauth->exchangeCode($code);

        return response()->json([
            'message' => 'Xero connected successfully.',
            'tenant_name' => $connection->tenant_name,
            'connected_at' => $connection->connected_at,
        ]);
    }

    /**
     * Get current Xero connection status.
     */
    public function status(): JsonResponse
    {
        $conn = $this->oauth->getActiveConnection();
        if (! $conn) {
            return response()->json(['connected' => false]);
        }

        return response()->json([
            'connected' => true,
            'tenant_name' => $conn->tenant_name,
            'connected_at' => $conn->connected_at,
            'token_expires_at' => $conn->token_expires_at,
            'token_expired' => $conn->isExpired(),
        ]);
    }

    /**
     * Disconnect Xero (mark inactive).
     */
    public function disconnect(): JsonResponse
    {
        $conn = $this->oauth->getActiveConnection();
        $conn?->update(['active' => false]);

        return response()->json(['message' => 'Xero disconnected.']);
    }

    /**
     * Push a specific invoice to Xero.
     */
    public function pushInvoice(int $id): JsonResponse
    {
        $invoice = Invoice::findOrFail($id);
        $this->sync->pushInvoice($invoice);

        return response()->json(['message' => 'Invoice pushed to Xero.']);
    }

    /**
     * Push a specific expense to Xero.
     */
    public function pushExpense(int $id): JsonResponse
    {
        $expense = Expense::findOrFail($id);
        $this->sync->pushExpense($expense);

        return response()->json(['message' => 'Expense pushed to Xero.']);
    }

    /**
     * Get paginated sync logs, mapped to the shape expected by the admin UI.
     */
    public function logs(Request $request): JsonResponse
    {
        $perPage = (int) $request->query('per_page', 20);
        $page = (int) $request->query('page', 1);

        $paginator = \App\Models\XeroSyncLog::orderByDesc('created_at')
            ->paginate($perPage, ['*'], 'page', $page);

        $data = $paginator->map(fn ($log) => [
            'id' => $log->id,
            'action' => $log->direction ?? 'push',
            'entity_type' => $log->resource_type,
            'entity_id' => $log->resource_id,
            'status' => $log->status,
            'message' => $log->error ?? null,
            'created_at' => $log->created_at,
        ])->values();

        return response()->json([
            'data' => $data,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }
}
