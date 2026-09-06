<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Finance\Services\BankStatementParser;
use App\Domains\Finance\Services\SettlementLedgerService;
use App\Domains\Finance\Support\SettlementChannels;
use App\Http\Controllers\Controller;
use App\Models\BankStatementImport;
use App\Models\BankStatementLine;
use App\Models\CashHandover;
use App\Models\Payment;
use App\Models\SiteSetting;
use App\Services\AuditLogService;
use App\Support\BusinessDay;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Bank settlements: does the money in the bank match what the till says?
 * See SettlementLedgerService for the rules.
 */
class SettlementController extends Controller
{
    public function __construct(
        private readonly SettlementLedgerService $ledger,
        private readonly BankStatementParser $parser,
        private readonly AuditLogService $audit,
    ) {}

    /** @return array{0: string, 1: string} */
    private function window(Request $request): array
    {
        $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date']);
        $to = $request->query('to') ? Carbon::parse((string) $request->query('to'))->toDateString() : BusinessDay::todayYmd();
        $from = $request->query('from') ? Carbon::parse((string) $request->query('from'))->toDateString() : Carbon::parse($to)->subDays(30)->toDateString();
        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }

        return [$from, $to];
    }

    public function cardQr(Request $request): JsonResponse
    {
        [$from, $to] = $this->window($request);

        return response()->json($this->ledger->cardQr($from, $to));
    }

    public function transfers(Request $request): JsonResponse
    {
        [$from, $to] = $this->window($request);

        return response()->json($this->ledger->transfers($from, $to));
    }

    public function cash(Request $request): JsonResponse
    {
        [$from, $to] = $this->window($request);

        return response()->json($this->ledger->cash($from, $to));
    }

    // ── statements ───────────────────────────────────────────────────────────

    public function imports(): JsonResponse
    {
        $rows = BankStatementImport::query()->with('importer:id,name')->orderByDesc('id')->limit(100)->get();

        return response()->json(['imports' => $rows->map(fn (BankStatementImport $i) => [
            'id' => $i->id,
            'account' => $i->account,
            'account_label' => SettlementChannels::accountLabel($i->account),
            'filename' => $i->filename,
            'imported_by' => $i->importer?->name,
            'line_count' => $i->line_count,
            'duplicate_count' => $i->duplicate_count,
            'credit_total_laar' => $i->credit_total_laar,
            'created_at' => $i->created_at?->toIso8601String(),
        ])->values()]);
    }

    /**
     * Upload a statement. `dry_run=1` only reads it back so the owner can see
     * what was understood before anything is stored.
     */
    public function importStatement(Request $request): JsonResponse
    {
        $data = $request->validate([
            'account' => ['required', Rule::in(SettlementChannels::ACCOUNTS)],
            'file' => ['required', 'file', 'max:10240', 'mimes:csv,txt,xls,xlsx'],
            'dry_run' => ['nullable', 'boolean'],
        ]);
        $file = $request->file('file');
        $parsed = $this->parser->parse($file->getRealPath(), $file->getClientOriginalName());

        if ($parsed['error'] !== null) {
            return response()->json(['message' => $parsed['error']], 422);
        }

        $account = $data['account'];
        $seen = [];
        $prepared = [];
        foreach ($parsed['lines'] as $line) {
            $tuple = implode('|', [$account, $line['txn_date'], $line['amount_laar'], $line['description'] ?? '', $line['reference'] ?? '']);
            $n = ($seen[$tuple] ?? 0) + 1;
            $seen[$tuple] = $n;
            // Two genuinely identical lines in one file are two lines; the
            // same file uploaded twice is not.
            $line['fingerprint'] = hash('sha256', $tuple . '|' . $n);
            $prepared[] = $line;
        }

        $existing = BankStatementLine::query()
            ->whereIn('fingerprint', array_column($prepared, 'fingerprint'))
            ->pluck('fingerprint')
            ->flip();
        $fresh = array_values(array_filter($prepared, fn ($l) => !isset($existing[$l['fingerprint']])));

        $summary = [
            'account' => $account,
            'account_label' => SettlementChannels::accountLabel($account),
            'filename' => $file->getClientOriginalName(),
            'columns' => $parsed['columns'],
            'credit_lines' => count($prepared),
            'new_lines' => count($fresh),
            'duplicate_lines' => count($prepared) - count($fresh),
            'debit_lines_skipped' => $parsed['debit_count'],
            'unreadable_lines' => $parsed['unreadable_count'],
            'credit_total_laar' => array_sum(array_column($fresh, 'amount_laar')),
            'date_from' => $fresh === [] ? null : min(array_column($fresh, 'txn_date')),
            'date_to' => $fresh === [] ? null : max(array_column($fresh, 'txn_date')),
            'preview' => array_slice(array_map(fn ($l) => [
                'txn_date' => $l['txn_date'], 'description' => $l['description'], 'reference' => $l['reference'], 'amount_laar' => $l['amount_laar'],
            ], $fresh), 0, 20),
        ];

        if (!empty($data['dry_run'])) {
            return response()->json(['dry_run' => true, 'summary' => $summary]);
        }

        $import = DB::transaction(function () use ($account, $file, $fresh, $prepared, $request) {
            $import = BankStatementImport::create([
                'account' => $account,
                'filename' => $file->getClientOriginalName(),
                'imported_by' => $request->user()?->id,
                'line_count' => count($fresh),
                'duplicate_count' => count($prepared) - count($fresh),
                'credit_total_laar' => array_sum(array_column($fresh, 'amount_laar')),
            ]);
            $auto = 0;
            foreach ($fresh as $l) {
                $row = BankStatementLine::create([
                    'import_id' => $import->id,
                    'account' => $account,
                    'txn_date' => $l['txn_date'],
                    'description' => $l['description'],
                    'reference' => $l['reference'],
                    'amount_laar' => $l['amount_laar'],
                    'balance_laar' => $l['balance_laar'],
                    'fingerprint' => $l['fingerprint'],
                ]);
                if ($account === SettlementChannels::TRANSFER && $this->ledger->autoMatchTransfer($row) === BankStatementLine::MATCH_AUTO) {
                    $auto++;
                }
            }
            $import->setAttribute('auto_matched', $auto);

            return $import;
        });

        $this->audit->log('settlement.statement.imported', 'BankStatementImport', $import->id, [], [
            'account' => $account, 'lines' => $import->line_count, 'duplicates' => $import->duplicate_count,
        ], [], $request);

        return response()->json([
            'dry_run' => false,
            'summary' => $summary + ['import_id' => $import->id, 'auto_matched' => (int) $import->getAttribute('auto_matched')],
        ], 201);
    }

    public function destroyImport(Request $request, int $id): JsonResponse
    {
        $import = BankStatementImport::findOrFail($id);
        $import->delete();
        $this->audit->log('settlement.statement.deleted', 'BankStatementImport', $id, ['filename' => $import->filename], [], [], $request);

        return response()->json(['message' => 'Statement removed — its lines no longer count.']);
    }

    // ── transfers ────────────────────────────────────────────────────────────

    public function matchTransfer(Request $request, int $lineId): JsonResponse
    {
        $data = $request->validate(['payment_id' => ['required', 'integer', 'exists:payments,id']]);
        $line = BankStatementLine::where('account', SettlementChannels::TRANSFER)->findOrFail($lineId);
        $payment = Payment::findOrFail((int) $data['payment_id']);

        if (!in_array((string) $payment->method, SettlementChannels::TRANSFER_METHODS, true)) {
            return response()->json(['message' => 'That payment was not a transfer.'], 422);
        }
        if (BankStatementLine::where('matched_payment_id', $payment->id)->where('id', '!=', $line->id)->exists()) {
            return response()->json(['message' => 'That payment is already matched to another statement line.'], 422);
        }

        $line->update(['matched_payment_id' => $payment->id, 'match_status' => BankStatementLine::MATCH_MANUAL]);

        return response()->json(['line' => ['id' => $line->id, 'match_status' => $line->match_status, 'matched_payment_id' => $payment->id]]);
    }

    public function unmatchTransfer(int $lineId): JsonResponse
    {
        $line = BankStatementLine::where('account', SettlementChannels::TRANSFER)->findOrFail($lineId);
        $line->update(['matched_payment_id' => null, 'match_status' => BankStatementLine::MATCH_UNMATCHED]);

        return response()->json(['line' => ['id' => $line->id, 'match_status' => $line->match_status]]);
    }

    /** A credit that is not a sale (a refund from a supplier, interest) is set aside, not matched. */
    public function ignoreLine(int $lineId): JsonResponse
    {
        $line = BankStatementLine::findOrFail($lineId);
        $line->update(['matched_payment_id' => null, 'match_status' => BankStatementLine::MATCH_IGNORED]);

        return response()->json(['line' => ['id' => $line->id, 'match_status' => $line->match_status]]);
    }

    public function restoreLine(int $lineId): JsonResponse
    {
        $line = BankStatementLine::findOrFail($lineId);
        $line->update(['match_status' => BankStatementLine::MATCH_UNMATCHED]);

        return response()->json(['line' => ['id' => $line->id, 'match_status' => $line->match_status]]);
    }

    // ── cash ─────────────────────────────────────────────────────────────────

    public function saveCashHandover(Request $request, string $date): JsonResponse
    {
        $ymd = Carbon::parse($date)->toDateString();
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:0', 'max:10000000'],
            'float_kept' => ['nullable', 'numeric', 'min:0', 'max:10000000'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        // Looked up by the day, not the cast value: a date column stored with
        // a midnight time would not equal the bare string and a second save
        // would try to insert twice.
        $row = CashHandover::whereDate('business_date', $ymd)->first() ?? new CashHandover(['business_date' => $ymd]);
        $row->fill([
            'amount_laar' => (int) round((float) $data['amount'] * 100),
            'float_kept_laar' => array_key_exists('float_kept', $data) && $data['float_kept'] !== null ? (int) round((float) $data['float_kept'] * 100) : null,
            'received_by' => $request->user()?->id,
            'notes' => $data['notes'] ?? null,
        ])->save();

        $this->audit->log('settlement.cash.recorded', 'CashHandover', $row->id, [], ['date' => $ymd, 'amount_laar' => $row->amount_laar], [], $request);

        $day = collect($this->ledger->cash($ymd, $ymd)['days'])->firstWhere('date', $ymd);

        return response()->json(['day' => $day]);
    }

    public function deleteCashHandover(string $date): JsonResponse
    {
        CashHandover::whereDate('business_date', Carbon::parse($date)->toDateString())->delete();

        return response()->json(['message' => 'Removed.']);
    }

    // ── settings ─────────────────────────────────────────────────────────────

    public function settings(): JsonResponse
    {
        return response()->json($this->settingsPayload());
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'start_date' => ['nullable', 'date'],
            'tolerance' => ['nullable', 'numeric', 'min:0', 'max:1000'],
            'alert_days' => ['nullable', 'integer', 'min:1', 'max:60'],
        ]);
        if (array_key_exists('start_date', $data)) {
            SiteSetting::set('settlement_start_date', $data['start_date'] ? Carbon::parse($data['start_date'])->toDateString() : '');
        }
        if (array_key_exists('tolerance', $data) && $data['tolerance'] !== null) {
            SiteSetting::set('settlement_tolerance_laar', (string) (int) round((float) $data['tolerance'] * 100));
        }
        if (array_key_exists('alert_days', $data) && $data['alert_days'] !== null) {
            SiteSetting::set('settlement_alert_days', (string) (int) $data['alert_days']);
        }

        return response()->json($this->settingsPayload());
    }

    private function settingsPayload(): array
    {
        return [
            'start_date' => SettlementChannels::startDate(),
            'tolerance' => SettlementChannels::toleranceLaar() / 100,
            'alert_days' => SettlementChannels::alertDays(),
            'accounts' => array_map(fn ($a) => ['key' => $a, 'label' => SettlementChannels::accountLabel($a)], SettlementChannels::ACCOUNTS),
            'card_qr_methods' => SettlementChannels::CARD_QR_METHODS,
        ];
    }
}
