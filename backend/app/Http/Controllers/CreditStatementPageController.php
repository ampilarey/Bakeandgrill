<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Credit\Services\CreditPaymentService;
use App\Models\Customer;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * The public credit statement, /credit/{token} (owner, 2026-10-21): what a
 * customer owes, every open invoice, and Pay online for the whole balance
 * or part of it. Token-gated like an invoice; the bank brings the customer
 * back here. The monthly statement text and the reminders link to it.
 */
class CreditStatementPageController extends Controller
{
    public function __construct(private readonly CreditPaymentService $credit) {}

    public function show(Request $request, string $token)
    {
        $customer = $this->customer($token);
        $this->credit->healLatestFor($customer);

        return response()
            ->view('credit.statement', [
                'customer' => $customer->fresh(),
                'statement' => $this->credit->statement($customer),
                'payment' => $request->query('payment'),
            ])
            ->header('Cache-Control', 'private, no-store');
    }

    /** POST /credit/{token}/pay {custom_mvr?}: the whole balance unless an amount is typed. */
    public function pay(Request $request, string $token)
    {
        $customer = $this->customer($token);
        $raw = trim((string) $request->input('custom_mvr', ''));
        $amountLaar = $raw !== '' && is_numeric($raw) ? (int) round(((float) $raw) * 100) : null;

        try {
            $url = $this->credit->startFromStatement($customer, $amountLaar);
        } catch (HttpException $e) {
            return redirect()->route('credit-statement.show', $token)->with('error', $e->getMessage() ?: 'Online payment is not available right now. Please try again shortly.');
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('credit statement page: gateway unavailable', ['customer_id' => $customer->id, 'error' => $e->getMessage()]);

            return redirect()->route('credit-statement.show', $token)->with('error', 'Online payment is not available right now. Please try again shortly.');
        }

        return redirect()->away($url);
    }

    private function customer(string $token): Customer
    {
        return Customer::query()->where('credit_statement_token', $token)->firstOrFail();
    }
}
