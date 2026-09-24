<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Gst\Services\GstExportService;
use App\Domains\Gst\Services\GstLedgerPoster;
use App\Domains\Gst\Services\GstPeriodService;
use App\Domains\Gst\Services\GstReconciliationService;
use App\Domains\Gst\Services\GstReportService;
use App\Domains\Gst\Services\GstSettingsService;
use App\Http\Controllers\Controller;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class GstReportController extends Controller
{
    public function __construct(
        private readonly GstReportService $reports,
        private readonly GstReconciliationService $reconciliation,
        private readonly GstExportService $exports,
        private readonly GstPeriodService $periods,
        private readonly GstSettingsService $settings,
        private readonly GstLedgerPoster $poster,
        private readonly AuditLogService $audit,
    ) {}

    public function summary(Request $request): JsonResponse
    {
        $period = $this->period($request);

        return response()->json($this->reports->summary($period));
    }

    public function outputStatement(Request $request): JsonResponse
    {
        return response()->json($this->reports->outputStatement($this->period($request)));
    }

    public function inputStatement(Request $request): JsonResponse
    {
        return response()->json($this->reports->inputStatement($this->period($request)));
    }

    /** GST on purchases and expenses that could be claimed but is not — a chase list. */
    public function toClaim(Request $request): JsonResponse
    {
        return response()->json($this->reports->toClaim($this->period($request)));
    }

    public function ledger(Request $request): JsonResponse
    {
        return response()->json($this->reports->ledger(
            $this->period($request),
            (int) $request->query('page', 1),
        ));
    }

    public function reconciliation(Request $request): JsonResponse
    {
        return response()->json([
            'period' => $this->period($request),
            'warnings' => $this->reconciliation->warnings($this->period($request)),
        ]);
    }

    public function lockPeriod(Request $request, string $period): JsonResponse
    {
        if ($this->periods->isLocked($period)) {
            return response()->json(['message' => 'Period already locked.'], 422);
        }

        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
        ]);
        $reason = trim((string) ($validated['reason'] ?? ''));

        /*
         * GST audit, 2026-09-26: locking is filing. A period with open
         * reconciliation warnings (an order with no GST entry, a refund whose
         * tax is still declared) used to lock without a word. Now the
         * warnings come back first, and locking anyway needs a reason on
         * record.
         */
        $warnings = GstReconciliationService::blocking($this->reconciliation->warnings($period));
        if ($warnings !== [] && mb_strlen($reason) < 5) {
            return response()->json([
                'message' => count($warnings) === 1
                    ? 'This period has 1 warning. Fix it, or give a reason to lock anyway.'
                    : 'This period has ' . count($warnings) . ' warnings. Fix them, or give a reason to lock anyway.',
                'needs_reason' => true,
                'warnings' => $warnings,
            ], 422);
        }

        $summary = $this->reports->summary($period);
        $lock = $this->periods->lock(
            $period,
            (int) $request->user()->id,
            (int) $summary['excess_input_carry_forward_laar'],
            $reason !== '' ? $reason : null,
        );

        $this->audit->log('gst.period.locked', 'GstPeriodLock', $lock->id, [], [
            'period_key' => $period,
            'carry_forward_input_laar' => $lock->carry_forward_input_laar,
            'lock_note' => $lock->lock_note,
            'open_warnings' => count($warnings),
        ], [], $request);

        return response()->json(['message' => 'Period locked.', 'lock' => $lock]);
    }

    public function manualAdjustment(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'period_key' => ['required', 'string', 'max:10'],
            'document_no' => ['required', 'string', 'max:64'],
            'document_date' => ['required', 'date'],
            'tax_code' => ['required', 'string'],
            'taxable_value_laar' => ['required', 'integer'],
            'tax_laar' => ['required', 'integer'],
            'total_laar' => ['required', 'integer'],
            'reason' => ['required', 'string', 'max:500'],
        ]);

        if ($this->periods->isLocked($validated['period_key'])) {
            $validated['period_key'] = $this->periods->nextOpenPeriodKey($validated['period_key']);
        }

        $entry = $this->poster->postManualAdjustment(array_merge($validated, [
            'source_id' => time(),
            'rate_bp' => $this->settings->defaultTaxRateBp(),
            'metadata' => ['reason' => $validated['reason']],
        ]), (int) $request->user()->id);

        $this->audit->log('gst.manual_adjustment', 'TaxLedgerEntry', $entry->id, [], $entry->toArray(), [], $request);

        return response()->json(['message' => 'Adjustment posted.', 'entry' => $entry], 201);
    }

    public function exportSummary(Request $request): BinaryFileResponse
    {
        $period = $this->period($request);
        $path = $this->exports->summaryCsv($period);
        $this->auditExport($request, $period, 'summary.csv');

        return response()->download($path)->deleteFileAfterSend();
    }

    public function exportOutputXlsx(Request $request): BinaryFileResponse
    {
        $period = $this->period($request);
        $path = $this->exports->outputStatementXlsx($period);
        $this->auditExport($request, $period, 'output-statement.xlsx');

        /*
         * GST audit, 2026-09-26: this re-locked on every export, writing the
         * carried-forward input tax back to 0 each time, and it locked past
         * open warnings. Now it locks once, carries the excess forward, and a
         * period with warnings waits for a lock by hand with a reason.
         */
        if ($this->settings->get()->lock_after_export
            && !$this->periods->isLocked($period)
            && GstReconciliationService::blocking($this->reconciliation->warnings($period)) === []) {
            $lock = $this->periods->lock(
                $period,
                (int) $request->user()->id,
                (int) $this->reports->summary($period)['excess_input_carry_forward_laar'],
                'Locked on export',
            );
            $this->audit->log('gst.period.locked', 'GstPeriodLock', $lock->id, [], [
                'period_key' => $period,
                'carry_forward_input_laar' => $lock->carry_forward_input_laar,
                'lock_note' => $lock->lock_note,
            ], [], $request);
        }

        return response()->download($path)->deleteFileAfterSend();
    }

    public function exportInputXlsx(Request $request): BinaryFileResponse
    {
        $period = $this->period($request);
        $path = $this->exports->inputStatementXlsx($period);
        $this->auditExport($request, $period, 'input-statement.xlsx');

        return response()->download($path)->deleteFileAfterSend();
    }

    public function exportLedger(Request $request): BinaryFileResponse
    {
        $period = $this->period($request);
        $path = $this->exports->ledgerCsv($period);
        $this->auditExport($request, $period, 'ledger.csv');

        return response()->download($path)->deleteFileAfterSend();
    }

    private function period(Request $request): string
    {
        $request->validate(['period' => 'nullable|string|max:10']);
        $period = $request->query('period');

        return $period ?: now()->format('Y-m');
    }

    private function auditExport(Request $request, string $period, string $type): void
    {
        $this->audit->log('gst.export.generated', 'GstReport', null, [], [
            'period' => $period,
            'type' => $type,
        ], [], $request);
    }
}
