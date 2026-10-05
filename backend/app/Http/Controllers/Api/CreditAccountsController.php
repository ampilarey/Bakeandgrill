<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Credit\Services\CreditAccountsService;
use App\Domains\Credit\Services\CreditChaseService;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Customers → Credit accounts: every account on one page, with the two
 * texts a chase needs (owner, 2026-10-05). Approving, limits, status,
 * repayments and write-offs stay on CustomerCreditController; this page
 * calls those for one account at a time.
 */
class CreditAccountsController extends Controller
{
    public function __construct(
        private readonly CreditAccountsService $accounts,
        private readonly CreditChaseService $chase,
    ) {}

    /** GET /admin/customers/credit-accounts */
    public function index(Request $request): JsonResponse
    {
        $v = $request->validate([
            'filter' => ['sometimes', Rule::in(CreditAccountsService::FILTERS)],
            'q' => ['nullable', 'string', 'max:120'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:10', 'max:200'],
        ]);

        return response()->json($this->accounts->list(
            (string) ($v['filter'] ?? 'all'),
            (string) ($v['q'] ?? ''),
            (int) ($v['page'] ?? 1),
            (int) ($v['per_page'] ?? 50),
        ));
    }

    /** POST /admin/customers/{id}/credit/remind — text the customer what they owe. */
    public function remind(Request $request, int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $v = $request->validate(['message' => ['nullable', 'string', 'max:500']]);
        $log = $this->chase->sendReminder($customer, $request->user(), $v['message'] ?? null);

        return response()->json(['message' => 'Reminder sent.', 'sms_log' => ['id' => $log->id, 'status' => $log->status]]);
    }

    /** POST /admin/customers/{id}/credit/pay-link — text a link to pay the oldest open invoice online. */
    public function payLink(Request $request, int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $log = $this->chase->sendPayLink($customer, $request->user());

        return response()->json(['message' => 'Pay link sent.', 'sms_log' => ['id' => $log->id, 'status' => $log->status]]);
    }
}
