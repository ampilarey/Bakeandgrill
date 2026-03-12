<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Accounting\Services\XeroOAuthService;
use App\Domains\Accounting\Services\XeroSyncService;
use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Models\Invoice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class XeroController extends Controller
{
    public function __construct(
        private XeroOAuthService $oauth,
        private XeroSyncService  $sync,
    ) {}

    /**
     * Redirect admin to Xero's OAuth authorization page.
     */
    public function connect(Request $request): RedirectResponse
    {
        $state = Str::random(32);
        $request->session()->put('xero_oauth_state', $state);

        return redirect($this->oauth->getAuthorizationUrl($state));
    }

    /**
     * Handle OAuth callback from Xero.
     */
    public function callback(Request $request): JsonResponse
    {
        $state = $request->query('state');
        if ($state !== $request->session()->pull('xero_oauth_state')) {
            return response()->json(['message' => 'Invalid OAuth state.'], 422);
        }

        $code = $request->query('code');
        if (!$code) {
            return response()->json(['message' => 'Authorization code missing.'], 422);
        }

        $connection = $this->oauth->exchangeCode($code);

        return response()->json([
            'message'     => 'Xero connected successfully.',
            'tenant_name' => $connection->tenant_name,
            'connected_at'=> $connection->connected_at,
        ]);
    }

    /**
     * Get current Xero connection status.
     */
    public function status(): JsonResponse
    {
        $conn = $this->oauth->getActiveConnection();
        if (!$conn) {
            return response()->json(['connected' => false]);
        }

        return response()->json([
            'connected'        => true,
            'tenant_name'      => $conn->tenant_name,
            'connected_at'     => $conn->connected_at,
            'token_expires_at' => $conn->token_expires_at,
            'token_expired'    => $conn->isExpired(),
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
     * Get recent sync logs.
     */
    public function logs(): JsonResponse
    {
        return response()->json(['logs' => $this->sync->getSyncLogs()]);
    }
}
