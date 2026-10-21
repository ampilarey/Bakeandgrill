<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Deposits\Services\WalletTopUpService;
use App\Domains\Deposits\Support\WalletTopUpRules;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerDepositAccount;
use App\Models\WalletTopUp;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Add money to the wallet by card from the order app (owner, 2026-10-21):
 * the rules this customer is under, start a top-up (the reply carries the
 * bank's page), and how a top-up went when the bank brings them back.
 */
class CustomerWalletTopUpController extends Controller
{
    public function __construct(private readonly WalletTopUpService $topUps) {}

    /** GET /api/customer/wallet/top-ups/rules */
    public function rules(Request $request): JsonResponse
    {
        return response()->json(['rules' => WalletTopUpRules::forCustomer($this->customer($request))]);
    }

    /** POST /api/customer/wallet/top-ups {amount_laar | amount_mvr} */
    public function start(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        $validated = $request->validate([
            'amount_laar' => ['nullable', 'integer', 'min:1'],
            'amount_mvr' => ['nullable', 'numeric', 'min:0.01'],
        ]);
        $amountLaar = isset($validated['amount_laar'])
            ? (int) $validated['amount_laar']
            : (int) round(((float) ($validated['amount_mvr'] ?? 0)) * 100);
        if ($amountLaar <= 0) {
            abort(422, 'Choose an amount first.');
        }

        $result = $this->topUps->startFromApp($customer, $amountLaar);

        return response()->json([
            'top_up' => $this->present($result['top_up']),
            'payment_url' => $result['payment_url'],
        ], 201);
    }

    /** GET /api/customer/wallet/top-ups/{token}: the customer's own top-up; asks the bank while it is pending. */
    public function show(Request $request, string $token): JsonResponse
    {
        $customer = $this->customer($request);
        $topUp = WalletTopUp::query()->where('token', $token)->where('customer_id', $customer->id)->firstOrFail();
        if ($topUp->status === WalletTopUp::STATUS_PENDING) {
            $this->topUps->heal($topUp);
            $topUp = $this->topUps->expireIfDue($topUp->fresh());
        }

        return response()->json([
            'top_up' => $this->present($topUp),
            'balance_mvr' => round(((int) (CustomerDepositAccount::query()->where('customer_id', $customer->id)->value('balance_laar') ?? 0)) / 100, 2),
        ]);
    }

    /** @return array<string, mixed> */
    private function present(WalletTopUp $topUp): array
    {
        $topUp->loadMissing('ledger');

        return [
            'token' => $topUp->token,
            'number' => $topUp->number(),
            'status' => $topUp->status,
            'amount_mvr' => $topUp->amount_laar !== null ? round($topUp->amount_laar / 100, 2) : null,
            'amount_fixed' => (bool) $topUp->amount_fixed,
            'balance_after_mvr' => $topUp->ledger !== null ? round(((int) $topUp->ledger->balance_after_laar) / 100, 2) : null,
            'paid_at' => $topUp->paid_at?->toIso8601String(),
            'expires_at' => $topUp->expires_at?->toIso8601String(),
            'url' => $topUp->url(),
        ];
    }

    private function customer(Request $request): Customer
    {
        $customer = $request->user();
        abort_unless($customer instanceof Customer, 403, 'Forbidden — customer access only.');

        return $customer;
    }
}
