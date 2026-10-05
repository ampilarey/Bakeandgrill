<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Credit\Services\CreditAccountsService;
use App\Domains\Credit\Services\CreditChaseService;
use App\Domains\Credit\Services\CreditRepaymentsReport;
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

    /**
     * GET /admin/customers/credit-repayments — every repayment in a date
     * range, with totals per method (owner, 2026-10-06: a daily list for
     * matching card and transfer repayments against the bank).
     */
    public function repayments(Request $request, CreditRepaymentsReport $report): JsonResponse
    {
        [$from, $to, $method, $q] = $this->repaymentFilters($request);

        return response()->json($report->build($from, $to, $method, $q));
    }

    /** GET /admin/customers/credit-repayments.csv — the same list as a spreadsheet. */
    public function repaymentsCsv(Request $request, CreditRepaymentsReport $report)
    {
        [$from, $to, $method, $q] = $this->repaymentFilters($request);
        $data = $report->build($from, $to, $method, $q, 20000);

        $handle = fopen('php://temp', 'r+');
        fputcsv($handle, ['Date and time', 'Customer', 'Phone', 'Retail or wholesale', 'Method', 'Amount (MVR)', 'Balance after (MVR)', 'Reference or note', 'Invoices', 'Recorded by', 'Shift']);
        $safe = function ($v): string {
            $s = (string) ($v ?? '');
            // A phone number is only digits after its +; leave it as written.
            if (preg_match('/^\+?[0-9 ]+$/', $s)) {
                return $s;
            }

            return preg_match('/^[=+\-@]/', $s) ? "'" . $s : $s;
        };
        foreach ($data['rows'] as $r) {
            fputcsv($handle, [
                $r['at'], $safe($r['customer']), $safe($r['phone']), $r['channel'] === 'wholesale' ? 'Wholesale' : 'Retail',
                $r['method_label'], number_format((float) $r['amount_mvr'], 2, '.', ''), number_format((float) $r['balance_after_mvr'], 2, '.', ''),
                $safe($r['reference']), implode(' ', $r['invoices']), $safe($r['recorded_by']), $r['shift_id'] ? '#' . $r['shift_id'] : '',
            ]);
        }
        fputcsv($handle, []);
        foreach ($data['totals']['by_method'] as $m) {
            fputcsv($handle, ['', '', '', 'Total', $m['label'], number_format((float) $m['total_mvr'], 2, '.', ''), '', $m['count'] . ' repayment(s)']);
        }
        fputcsv($handle, ['', '', '', 'Total', 'All methods', number_format((float) $data['totals']['total_mvr'], 2, '.', '')]);
        rewind($handle);
        $csv = (string) stream_get_contents($handle);
        fclose($handle);

        $name = 'credit-repayments-' . $data['from'] . ($data['to'] !== $data['from'] ? '-to-' . $data['to'] : '') . '.csv';

        return response($csv, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="' . $name . '"',
            'Cache-Control' => 'no-store',
        ]);
    }

    /** @return array{0: \Illuminate\Support\Carbon, 1: \Illuminate\Support\Carbon, 2: string, 3: string} */
    private function repaymentFilters(Request $request): array
    {
        $v = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'method' => ['nullable', Rule::in(CreditRepaymentsReport::METHODS)],
            'q' => ['nullable', 'string', 'max:120'],
        ]);
        $tz = (string) config('app.timezone', 'Indian/Maldives');
        $today = now($tz)->toDateString();
        $from = \Illuminate\Support\Carbon::parse($v['from'] ?? $today, $tz);
        $to = \Illuminate\Support\Carbon::parse($v['to'] ?? ($v['from'] ?? $today), $tz);
        if ($from->diffInDays($to) > 366) {
            throw \Illuminate\Validation\ValidationException::withMessages(['to' => ['Pick a range of a year or less.']]);
        }

        return [$from, $to, (string) ($v['method'] ?? 'all'), (string) ($v['q'] ?? '')];
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
